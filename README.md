# ShieldFund Proof Server

The missing piece referenced in [`shieldfund-contracts`](https://github.com/Crowder-Stellar/shieldfund-contracts)'s
`proof_registry` circuit doc comments:

> Called by the proof backend after successfully generating and locally
> verifying the Noir proof. Only the admin or pre-approved submitters should
> call this in production — for hackathon the admin submits.

That "proof backend" didn't exist anywhere in the ShieldFund repos — `proof_registry::register_proof()`
accepted any 32-byte hash from anyone with signing rights, with no cryptographic guarantee a real proof
ever backed it. This is a real implementation of it: a Noir circuit that actually proves something, plus
an Express service that compiles it, proves it, and locally verifies it with [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
before anchoring a hash on-chain.

---

## What the circuit proves

`circuits/payroll_compliance` proves, **without revealing the full allowlist or the exact budget cap**:

1. `recipient_id` belongs to an admin-published allowlist (Merkle inclusion against a public `merkle_root`).
2. `amount` does not exceed a budget cap the admin committed to in advance
   (`budget_commitment = pedersen_hash([budget_cap, budget_salt])`), without revealing `budget_cap` itself.
3. `proof_type_id` is one of ShieldFund's three categories (0 = payroll, 1 = operational, 2 = relief),
   matching the `proof_type` Symbol values `proof_registry` already stores.

`recipient_id` and `amount` are public in the proof even though they gate a private fact, because both
already appear as plaintext arguments to `treasury_vault::disburse()` on-chain — there's no privacy to
preserve by hiding them a second time. What actually stays hidden is the *rest* of the allowlist (which
other employees/recipients are approved) and the *exact* budget figure — only a commitment to it is public.

```
User (recipient_id, amount) ─────────────┐
                                           ▼
Admin's allowlist ──► Merkle tree ──► merkle_root (public)
Admin's budget cap ──► pedersen_hash(cap, salt) ──► budget_commitment (public)
                                           │
                              payroll_compliance circuit
                    (proves membership + amount ≤ cap, in zero knowledge)
                                           │
                                           ▼
                        UltraHonk proof ──► bb verify (local) ──► proof_hash
                                                                        │
                                                                        ▼
                                              proof_registry.register_proof(proof_hash, ...)
                                                                        │
                                                                        ▼
                                          treasury_vault.disburse(recipient, amount, proof_hash)
```

The server builds the allowlist Merkle tree in-process with Barretenberg's own Pedersen implementation
([`@aztec/bb.js`](https://www.npmjs.com/package/@aztec/bb.js), pinned to the same version as `bb`), which takes
a few milliseconds for a full 16-leaf tree. `circuits/hash_util` is a tiny circuit (`pedersen_hash([a, b])`)
that the tests execute to check the in-process hash matches the circuit's exactly.

Each proof runs in its own temporary directory: the witness is generated in-process with
[`@noir-lang/noir_js`](https://www.npmjs.com/package/@noir-lang/noir_js), then `bb prove` / `bb verify` read and
write only that directory, which is deleted afterwards. Nothing under `circuits/` is modified per request.

---

## Why this wasn't "just verify on-chain instead"

Soroban has no native Groth16/UltraHonk verifier precompile, so a real on-chain Noir verifier means porting
proof-system arithmetic into Rust/WASM yourself — expensive in gas and engineering time, and it's why the
original contracts settled for a hash-anchor pattern. This repo keeps that architecture (verify off-chain,
anchor the hash on-chain) but makes the off-chain half real: `bb prove` generates an actual UltraHonk proof
and `bb verify` actually checks it before any hash gets returned to a caller. What's still true, and worth
being direct about: the *on-chain* contract still can't independently confirm a real proof exists — it
trusts whichever address is authorized to call `register_proof()`. Closing that last gap requires either an
on-chain verifier contract or a threshold/multi-party attestation scheme; out of scope here.

---

## Toolchain

Pinned versions (this circuit was built and tested against exactly these):

| Tool | Version |
|------|---------|
| `nargo` (Noir) | `1.0.0-beta.22` |
| `bb` (Barretenberg) | `5.0.0-nightly.20260522` |

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.22

curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup -v 5.0.0-nightly.20260522
```

## Quick start

```bash
npm install
npm start
# → http://localhost:4100
```

By default the server shells out to `~/.nargo/bin/nargo` and `~/.bb/bb`. Override with `NARGO_BIN=` /
`BB_BIN=` env vars (see `.env.example`) if yours live elsewhere. Before the first proof the server runs
`nargo compile` once on `payroll_compliance` (writing only to its gitignored `target/`).

Up to `MAX_CONCURRENT_PROOFS` (default 2) proofs run at once; further requests wait their turn. Each
`bb prove` is CPU- and memory-heavy, so size this to the cores you can spare. The last `TREE_CACHE_SIZE`
(default 100) allowlist trees are cached, so repeat proofs against the same allowlist skip rebuilding it.

### Health check

```bash
curl http://localhost:4100/health
```

### Generate + anchor a proof

```bash
curl -X POST http://localhost:4100/api/prove \
  -H 'content-type: application/json' \
  -H "x-api-key: $PROVE_API_KEY" \
  -d '{
    "recipientId": "42",
    "amount": "500000",
    "proofType": "payroll",
    "allowlist": ["42", "7", "1001"],
    "budgetCap": "1000000",
    "budgetSalt": "0x1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79"
  }'
```

```json
{
  "valid": true,
  "proofType": "payroll",
  "proofHash": "0xeee8727c...",
  "publicInputsHash": "0x5a5f1261...",
  "merkleRoot": "0x045c00e7...",
  "budgetCommitment": "0x248412bd...",
  "recipientId": "0x...2a",
  "amount": "0x...7a120",
  "publicInputs": ["0x045c00e7...", "0x248412bd...", "0x...2a", "0x...7a120", "0x00...0"],
  "proofSizeBytes": 14656,
  "provingTimeMs": 1469,
  "scheme": "ultra_honk"
}
```

`proofHash` and `publicInputsHash` are keccak256, 32 bytes each — feed them directly into
`proof_registry::register_proof(submitter, proof_hash, public_inputs_hash, proof_type)`.

If `recipientId` isn't in `allowlist`, or `amount` exceeds `budgetCap`, or `proofType` is unrecognized,
the endpoint returns `400` with the Noir `assert()` message (or a validation message) instead of a proof —
the circuit's constraints are the actual source of truth for what's rejected, not application-level checks
layered on top.

All numeric inputs (`recipientId`, `amount`, `budgetCap`, `budgetSalt`, allowlist entries) must be non-negative
integers as decimal or `0x`-hex strings, below the BN254 field modulus (`amount` and `budgetCap` below 2^128). They're
rejected with a 400 rather than silently reduced modulo the field. `recipientId` 0 is reserved for Merkle padding,
and allowlists hold at most 16 distinct entries.

`budgetSalt` is required and is never returned. It hides `budgetCap` inside the public `budget_commitment`, so
anyone who learns or guesses it can brute-force the cap. Generate one per budget category with
`openssl rand -hex 31`, store it as a secret alongside the cap, and send the same value with every proof
against that budget (a new salt produces a different commitment from the one published on-chain). Salts below
2^120 are rejected as guessable.

`proofSizeBytes` is the proof's serialized size: 32 bytes per field element.

#### Auth, limits and errors

`/api/prove` requires an `X-API-Key` header matching one of the comma-separated keys in `PROVE_API_KEYS`
(generate with `openssl rand -hex 32`; keep them out of git). With no keys configured the endpoint returns `503`
for every request. It never runs unauthenticated.

| Status | Meaning |
|---|---|
| `400` | Invalid input, malformed JSON, or a Noir `assert()` rejected the inputs |
| `401` | Missing or unknown `X-API-Key` |
| `413` | Body larger than 32kb |
| `429` | Rate limit hit: `PROVE_RATE_LIMIT_PER_IP` / `PROVE_RATE_LIMIT_PER_KEY` requests per `PROVE_RATE_WINDOW_MS` (see the `RateLimit` response headers) |
| `500` | Toolchain failure or a `nargo`/`bb` run over `SUBPROCESS_TIMEOUT_MS`. Returns only a `requestId`; details are in the server log |
| `503` | No API keys configured, or the server is shutting down |

Behind a reverse proxy, set `TRUST_PROXY_HOPS` (usually `1`) so per-IP limits see the real client address.

Logs are JSON lines (pino) on stdout, one per request, with method, path, status, duration and request id.
Request bodies are never logged, and `budgetCap`/`budgetSalt`/API keys are redacted if they ever appear in
a log object. On `SIGTERM`/`SIGINT` the server stops accepting connections and lets an in-flight proof
finish (up to `SHUTDOWN_TIMEOUT_MS`) before exiting.

### Address → Field helper

Stellar `G...` addresses aren't Field elements. If you only have an address, not an already-derived
`recipientId`:

```bash
curl -X POST http://localhost:4100/api/address-to-field \
  -H 'content-type: application/json' \
  -d '{"address": "GBJ5FP5UB4YUE2EONTPPSAGKZZGDETFZLEJXJRCALSYTJZIDVWAN3C7P"}'
```

`address` must be a valid Stellar account id (`G` prefix, 56 chars, correct StrKey checksum); anything else
is a 400.

---

## Known limitations (this is a hackathon-grade reference implementation, not production)

- **Allowlist capacity is 16** (`MERKLE_DEPTH = 4` in the circuit). Raise `DEPTH` in
  `circuits/payroll_compliance/src/main.nr` and `MERKLE_DEPTH` in `src/config.js` together to scale — they
  must always match (`test/depth.test.js` fails if they don't).
- **`recipientId` "0" is a reserved padding sentinel** for unused allowlist slots — never assign it to a
  real recipient.
- **On-chain trust boundary unchanged**: `proof_registry` still can't verify a proof itself, only anchor a
  hash. This server is the trusted party that promises the hash corresponds to a real, locally-verified
  proof — same trust model the original contract comments described, just now actually implemented rather
  than assumed.
- **Concurrency is per process**: `MAX_CONCURRENT_PROOFS` and the tree cache live in memory, so running
  several instances multiplies the CPU budget and gives each its own cache.
