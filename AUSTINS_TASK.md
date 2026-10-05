# Austin's Tasks — shieldfund-proof-server

On 2026-09-22 a force-push from your account replaced commit `7a56d35` ("Add CI workflow") with a look-alike
commit (`0819bd7`) that hid an obfuscated JavaScript loader at the end of `src/server.js`, pushed far off-screen
with whitespace. It's been cleaned up. This is fixable and you're still on the team — the list below gets your
account safe first, then turns the incident into a stronger codebase.

**Rules for this list**

- Work top to bottom. **Section 0 must be finished before you push anything.**
- One task = one branch = one PR into `main`. `main` is protected: no force-pushes, 1 approving review required.
- Never force-push. Never rewrite someone else's commits.
- Tick the box in this file in the same PR that completes the task.

Priority: **P0** = now · **P1** = this sprint · **P2** = next sprint

---

## 0. Account & machine security (P0 — before any other work)

- [ ] **1. Secure your GitHub account.** Change your password, sign out all sessions
  (Settings → Sessions), and enable 2FA with an authenticator app or passkey (not SMS).
- [ ] **2. Revoke every token.** Delete all personal access tokens (classic and fine-grained) and SSH keys
  you don't recognise or no longer need; re-create only what you use, with minimal scopes and an expiry.
- [ ] **3. Audit authorized apps.** Settings → Applications → Authorized OAuth Apps / GitHub Apps — revoke
  anything unfamiliar, especially apps with `repo` or `workflow` scope.
- [ ] **4. Check your machine.** The payload targets developer environments. Run a full malware scan, check
  for unknown global npm packages (`npm ls -g --depth=0`), unknown VS Code extensions, and odd entries in
  shell rc files / startup items. If in doubt, reinstall the OS.
- [ ] **5. Check your own repos.** Search every repo you own or have pushed to since September for the same
  pattern (a line ending in hundreds of spaces followed by `global.o=` or `_$_` identifiers). Report anything
  you find to Ndii.
- [ ] **6. Re-clone cleanly.** Delete your local `shieldfund-proof-server` clone and clone fresh from
  `main`. Do **not** push any old local branches.
- [ ] **7. Write a short incident note** (`docs/incidents/2026-09-22.md`): timeline, how the account was
  likely compromised, what you changed in steps 1–6. Blameless — facts only.

## 1. Repository hardening (P0)

- [ ] **8. Whitespace-padding guard in CI.** Add a CI step that fails if any tracked source file has a line
  longer than 300 chars or more than 20 consecutive trailing spaces (this is exactly how the payload hid).
- [ ] **9. Obfuscation scanner in CI.** Fail the build on patterns like `global[...] = require`,
  `_$_[0-9a-f]{4}`, `Function("return this")`, or `eval(` anywhere under `src/` and `test/`.
- [ ] **10. Pin GitHub Actions to commit SHAs.** In `.github/workflows/ci.yml`, replace `actions/checkout@v4`,
  `setup-node@v4`, `cache@v4` with full SHAs (comment the version beside each).
- [ ] **11. Stop `curl | bash` from `master`/`main`.** The CI installs noirup/bbup from moving branches.
  Pin to a tagged release URL and verify a checksum before executing.
- [ ] **12. Pin `bb` explicitly in CI.** `bbup` currently auto-resolves; call it with the exact version
  `5.0.0-nightly.20260522` so CI matches the README table.
- [ ] **13. Least-privilege workflow token.** Add `permissions: contents: read` at the top of `ci.yml`.
- [ ] **14. Add `CODEOWNERS`.** Require review from both org members for `src/`, `circuits/`, and
  `.github/`.
- [ ] **15. Add `SECURITY.md`.** How to report a vulnerability privately, and the response expectation.
- [ ] **16. Enable Dependabot** (`.github/dependabot.yml`) for `npm` and `github-actions`, weekly.

## 2. Circuit correctness (P0 — real bugs)

- [ ] **17. Fix the `Field → u128` truncation bug.** In `circuits/payroll_compliance/src/main.nr`,
  `amount as u128` and `budget_cap as u128` **truncate** to the low 128 bits. An `amount` of `2^128 + 1`
  passes the `amount <= budget_cap` check while the public input says something huge. Add
  `amount.assert_max_bit_size::<128>()` (and the same for `budget_cap`) before the cast.
- [ ] **18. Add a Noir test proving #17 is fixed** (`#[test(should_fail)]` with an amount ≥ 2^128).
- [ ] **19. Reject recipient `0` in the circuit.** Add `assert(recipient_id != 0)`. Right now an allowlist
  with fewer than 16 entries has padding leaves of `pedersen([0, 0])`, so recipient `0` can prove
  membership in *any* non-full allowlist.
- [ ] **20. Domain-separate leaves from internal nodes.** Leaves are `pedersen([id, 0])` and nodes are
  `pedersen([l, r])` — same function, no domain tag. Hash leaves with a distinct tag (e.g.
  `pedersen([1, id])`) or use `pedersen_hash_with_separator`; update `hash_util` and `merkle.js` to match.
- [ ] **21. Add Noir tests** for: non-member rejected, over-budget rejected, bad `proof_type_id` rejected,
  wrong salt rejected, boundary `amount == budget_cap` accepted.

## 3. Server input validation (P0/P1)

- [ ] **22. Reject recipient `0` in the API.** `merkle.js` only blocks the string `"0"` inside `allowlist`;
  `recipientId: "0"`, `"0x0"`, or `"00"` sail through and match a padding slot. Normalise first, then reject.
- [ ] **23. Normalise IDs before comparing.** `pathFor()` uses `ids.indexOf(recipientId)` on raw strings, so
  `"42"` and `"0x2a"` are different recipients. Convert everything with `toFieldHex()` before building the
  tree and looking up paths.
- [ ] **24. Reject duplicate allowlist entries** (after normalisation).
- [ ] **25. Reject negative and out-of-range numbers.** `toFieldHex()` silently reduces mod p, so
  `amount: "-1"` becomes `p - 1`. `amount`, `budgetCap`, and IDs must be non-negative integers below 2^128
  (IDs below the field modulus).
- [ ] **26. Validate types strictly.** Reject non-string/non-integer values, floats, `"1e6"`, empty strings,
  and arrays where scalars are expected — before `BigInt()` throws a 500.
- [ ] **27. Validate `budgetCap` is present.** It is currently not checked and fails deep inside nargo.
- [ ] **28. Validate the Stellar address** in `/api/address-to-field` (G-prefixed, 56 chars, valid
  checksum) instead of hashing any string.

## 4. Cryptographic hygiene (P1)

- [ ] **29. Use a CSPRNG for the default salt.** `proveService.js` builds `budgetSalt` from `Date.now()` and
  `Math.random()`. Replace with `crypto.randomBytes(31)` → field element.
- [ ] **30. Document salt secrecy.** The response returns `budgetSalt` next to `budgetCommitment`. With
  both, anyone can brute-force a low-entropy `budgetCap`. Decide with Ndii whether to stop returning the
  salt (caller supplies it) or return it only to an authenticated admin. Implement the decision.
- [ ] **31. Stop leaking internals in 500s.** `server.js` returns `detail: err.message`, which can include
  file paths and raw nargo/bb output. Log it server-side, return a request ID to the client.
- [ ] **32. Fix `proofSizeBytes`.** It currently measures the JSON string length, not bytes. Compute the
  real byte length of the proof field elements.

## 5. API security & reliability (P1)

- [ ] **33. Authenticate `/api/prove`.** Anyone can currently burn ~25 s of CPU per request. Add an API key
  or signed-request check (secret from env, never committed).
- [ ] **34. Rate limiting** on `/api/prove` (per IP and per key).
- [ ] **35. Explicit body-size limit** on `express.json()` (e.g. `32kb`).
- [ ] **36. Request timeout** for `nargo`/`bb` subprocesses in `nargoRunner.js` (`execFile` `timeout`
  option) so a hung process can't hold the mutex forever.
- [ ] **37. Add `helmet`** and disable `x-powered-by`.
- [ ] **38. Graceful shutdown** on `SIGTERM`: stop accepting requests, let the in-flight proof finish.
- [ ] **39. Structured logging** (e.g. `pino`) with a request ID per call; never log `budgetCap` or salts.

## 6. Architecture & performance (P1/P2)

- [ ] **40. Stop writing into tracked files.** The server overwrites the git-tracked
  `circuits/*/Prover.toml` and writes into `target/`. Use a per-request temp directory instead.
- [ ] **41. Per-request workspaces remove the global mutex.** Once #40 is done, run requests in parallel
  with a small concurrency cap instead of serialising everything.
- [ ] **42. Replace `nargo execute` hashing with in-process WASM** (`@noir-lang/noir_js` /
  `@aztec/bb.js` or a JS Pedersen implementation) — the README notes tree-building takes ~25 s. Target: under
  1 s for a 16-leaf tree, with a test proving hashes match the circuit's.
- [ ] **43. Cache allowlist trees** by root so repeated proofs against the same allowlist skip rebuilding.
- [ ] **44. Make `MERKLE_DEPTH` single-source.** Read it from the compiled circuit ABI, or add a test that
  fails if `config.js` and `main.nr` disagree.

## 7. Tests, tooling & docs (P1/P2)

- [ ] **45. Unit tests for `hash.js` and `merkle.js`** that don't need nargo/bb (mock `hashPair`).
- [ ] **46. API tests with `supertest`** covering every 400 path added in sections 3–5.
- [ ] **47. Add ESLint + Prettier** and run them in CI; fail on lint errors.
- [ ] **48. Add `.nvmrc`** (`20`) and an `engines` field in `package.json`.
- [ ] **49. Add a `Dockerfile`** with pinned nargo/bb versions, running as a non-root user.
- [ ] **50. Update `README.md`** for everything above: new validation rules, auth, salt handling, Docker
  usage, and a "Security" section linking `SECURITY.md`.

---

When all 50 boxes are ticked, open one final PR that moves this file to `docs/archive/AUSTINS_TASK.md`.
