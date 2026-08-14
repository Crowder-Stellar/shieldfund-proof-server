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

`circuits/hash_util` is a second, tiny circuit (`pedersen_hash([a, b])`) with no business logic of its
own — it exists purely so the proof-server can build the allowlist Merkle tree off-chain using the exact
same hash `payroll_compliance` recomputes internally, by executing it (never proving it) via `nargo execute`.

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
bbup   # auto-resolves the matching bb version from the installed nargo version
```

## Quick start

```bash
npm install
npm start
# → http://localhost:4100
```

By default the server shells out to `~/.nargo/bin/nargo` and `~/.bb/bb`. Override with `NARGO_BIN=` /
`BB_BIN=` env vars (see `.env.example`) if yours live elsewhere.

### Health check

```bash
curl http://localhost:4100/health
```

### Generate + anchor a proof

```bash
curl -X POST http://localhost:4100/api/prove \
  -H 'content-type: application/json' \
  -d '{
    "recipientId": "42",
    "amount": "500000",
    "proofType": "payroll",
    "allowlist": ["42", "7", "1001"],
    "budgetCap": "1000000",
    "budgetSalt": "777"
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
  "budgetSalt": "777",
  "recipientId": "0x...2a",
  "amount": "0x...7a120",
  "publicInputs": ["0x045c00e7...", "0x248412bd...", "0x...2a", "0x...7a120", "0x00...0"],
  "proofSizeBytes": 31603,
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

`budgetSalt` is optional — if omitted the server generates one, but you must persist whatever value comes
back in the response to reuse the same `budget_commitment` for later proofs against the same budget
category (reusing a *cap* with a *new* salt produces a different, equally valid commitment — the admin
just has to know which one they published on-chain).

### Address → Field helper

Stellar `G...` addresses aren't Field elements. If you only have an address, not an already-derived
`recipientId`:

```bash
curl -X POST http://localhost:4100/api/address-to-field \
  -H 'content-type: application/json' \
  -d '{"address": "GBJ5FP5UB4YUE2EONTPPSAGKZZGDETFZLEJXJRCALSYTJZIDVWAN3C7P"}'
```

---

## Known limitations (this is a hackathon-grade reference implementation, not production)

- **Allowlist capacity is 16** (`MERKLE_DEPTH = 4` in the circuit). Raise `DEPTH` in
  `circuits/payroll_compliance/src/main.nr` and `MERKLE_DEPTH` in `src/config.js` together to scale — they
  must always match.
- **Merkle tree construction is slow** (~1s per node via `nargo execute` subprocess calls, ~25s total for a
  16-leaf tree) because it shells out to the CLI once per hash instead of using in-process WASM bindings
  (`@noir-lang/noir_js`). Proving itself is fast (~1.5s); tree-building dominates request latency. Swapping
  in `noir_js`/`bb.js` for in-process execution would fix this — left as CLI calls here because they're the
  toolchain already verified working end-to-end in this environment.
- **`recipientId` "0" is a reserved padding sentinel** for unused allowlist slots — never assign it to a
  real recipient.
- **On-chain trust boundary unchanged**: `proof_registry` still can't verify a proof itself, only anchor a
  hash. This server is the trusted party that promises the hash corresponds to a real, locally-verified
  proof — same trust model the original contract comments described, just now actually implemented rather
  than assumed.
- **Concurrency**: requests are serialized per circuit (nargo/bb read and write files in the circuit
  directory) via an in-process mutex — fine for a demo, not for concurrent production load.
