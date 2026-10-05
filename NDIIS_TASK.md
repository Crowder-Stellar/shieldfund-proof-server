# Ndii's Tasks — shieldfund-proof-server & Crowder-Stellar org

Owner/lead tasks following the 2026-09-22 force-push incident on `shieldfund-proof-server`, plus the
org-level and cross-repo work across all ShieldFund repos. Austin's list is in
[`AUSTINS_TASK.md`](./AUSTINS_TASK.md).

**Rules:** `main` is protected on every repo — one task = one branch = one PR, reviewed by Austin.
Tick the box in the PR that completes the task.

Priority: **P0** = now · **P1** = this sprint · **P2** = next sprint

---

## 0. Incident cleanup (P0)

- [x] **1. Restore clean `main`.** Force-pushed `7a56d35` (+ task files) over the tampered `0819bd7`.
- [x] **2. Verify the payload is gone** on GitHub: `src/server.js` ends at `module.exports = app;`.
- [x] **3. Protect `main` on all 5 repos** — no force-push, no deletion, 1 review, enforced for admins.
- [ ] **4. Check for deployments.** Confirm nothing (Render, VPS, a laptop) ran this repo from `origin/main`
  between 2026-09-22 and the restore. If something did, treat that host as compromised.
- [ ] **5. Talk to Austin directly** (not over GitHub) and walk through Section 0 of his list with him.
- [ ] **6. Secure your own account**: rotate your PATs, review authorized OAuth apps, confirm 2FA.
- [ ] **7. Scan your own machine** the same way Austin is asked to (global npm packages, editor
  extensions, shell rc files).
- [ ] **8. Delete the local `backup/clean-7a56d35` branch** if it exists and prune stale local branches in
  all five clones.

## 1. Org security settings (P0)

- [ ] **9. Require 2FA for all members** (org Settings → Authentication security).
- [ ] **10. Enable secret scanning + push protection** for all repos, and for new repos by default.
- [ ] **11. Enable Dependabot alerts and security updates** org-wide.
- [ ] **12. Restrict destructive member permissions**: turn off "members can delete repositories" and
  "members can change repository visibility".
- [ ] **13. Review the org audit log** for 2026-09-01 → now: other force-pushes, new tokens, new apps,
  membership or permission changes.
- [ ] **14. Replace per-repo protection with an org ruleset** so every new repo gets a protected `main`.
- [ ] **15. Restrict GitHub Actions** to GitHub-owned and verified actions only (org → Actions → General).
- [ ] **16. Set the default `GITHUB_TOKEN` to read-only** org-wide.
- [ ] **17. Require signed commits** on `main` (SSH or GPG signing) — a spoofed author name like the one
  in `0819bd7` would then show as "Unverified" and be rejected.
- [ ] **18. Give the org a description, avatar, and verified domain** so it isn't mistaken for a
  throwaway.

## 2. Review & decisions (P1)

- [ ] **19. Review Austin's PRs** against `AUSTINS_TASK.md`, P0 sections first; extra scrutiny on
  `.github/workflows/` and `circuits/`.
- [ ] **20. Decide salt handling** with Austin (his #30): caller-supplied salt only, or salt returned only to
  an authenticated admin.
- [ ] **21. Decide the auth model** for `/api/prove` (his #33): API key, signed requests, or only reachable
  from `shieldfund-backend` on a private network.
- [ ] **22. Write `CONTRIBUTING.md`** in `.github` (branch naming, PR template, review rules) and apply it
  org-wide.
- [ ] **23. Add a PR template** with a security checklist (no secrets, no long lines, no new deps without
  review).

## 3. shieldfund-contracts (P0/P1)

- [ ] **24. Protect `initialize()` from front-running.** `treasury_vault`, `proof_registry`, and `streaming`
  all accept any `admin` with no `require_auth()`, so whoever calls first after deploy owns the contract.
  Add `admin.require_auth()`, or deploy and initialize in one transaction from `scripts/deploy-testnet.sh`.
- [ ] **25. Extend storage TTLs.** No contract calls `extend_ttl`, so instance and persistent entries
  (admin, balances, proofs, streams) will be archived. Bump TTLs on every write and on reads of hot keys.
- [ ] **26. Bind proofs to disbursements (critical).** `treasury_vault::disburse()` only checks that
  `proof_hash` exists in the registry — it never checks the proof's `public_inputs_hash` against *this*
  `recipient` and `amount`, and never marks the proof as spent. Any registered proof can pay any recipient
  any amount, any number of times. Recompute and compare the public-inputs hash, and mark proofs consumed.
- [ ] **27. Two-step admin transfer.** `transfer_admin()` sets the new admin immediately; switch to
  propose → accept so a typo can't brick the contract.
- [ ] **28. Emit events** for every state change — only `disburse` does today; add deposit, register_proof,
  create/toggle/withdraw stream, and admin changes so the backend can index from events instead of polling.
- [ ] **29. Replace `panic!` strings with `contracterror` enums** so clients get typed errors.
- [ ] **30. Add overflow and edge-case tests**: zero/negative amounts, `i128` limits, stream end-time
  boundaries, withdraw after completion.
- [ ] **31. Pagination for `get_all_proofs` / `get_all_streams`.** Returning whole vectors will hit
  resource limits as data grows.
- [ ] **32. Re-deploy to testnet** after the circuit fixes (Austin #17, #19, #20) and update contract IDs in
  backend, frontend, and the proof-server README.
- [ ] **33. Get an external review** of the three contracts before any mainnet deployment.

## 4. shieldfund-backend (P1)

- [ ] **34. Implement `POST /proofs/verify`.** `src/routes/proofs.ts` has a `TODO: run Noir verifier`
  — either forward to the proof server's `bb verify` or remove the endpoint. It must not return success
  for unverified input.
- [ ] **35. Lock down CORS.** `src/index.ts` uses `cors()` with no options (any origin). Allow only the
  frontend's origins from env.
- [ ] **36. Authenticate `POST /campaigns`** — anyone can currently create or overwrite campaigns
  (`INSERT OR REPLACE`).
- [ ] **37. Validate request bodies** with `zod` on every route.
- [ ] **38. Add rate limiting** to all write routes.
- [ ] **39. Protect the Pinata keys**: confirm they were never committed, rotate them, and scope them to
  pin-only.
- [ ] **40. Move from SQLite file to a managed DB** (or at least back up `data/shieldfund.db`) before
  hosting.
- [ ] **41. Close the anchoring loop.** Have the backend call the proof server, then submit
  `register_proof()` from a dedicated submitter key — never accept a raw proof hash from the browser.

## 5. shieldfund-frontend (P1)

- [ ] **42. Handle the proof server's new 400/401 errors** in `src/lib/proofServer.ts` and
  `ManualVerificationModal`.
- [ ] **43. Never send budget caps or salts from the browser** to a server you don't control; route proof
  requests through the backend.
- [ ] **44. Add a Content-Security-Policy** (Vite/hosting headers) and audit third-party scripts.
- [ ] **45. Replace `initialData.ts` mock data** with live contract/backend reads, or label demo mode
  clearly in the UI.
- [ ] **46. Rename the logo asset** (`shield_logo_1782492391347.jpg`) and remove unused assets.

## 6. Ops & roadmap (P2)

- [ ] **47. Pick hosting** for all three services (proof server needs nargo + bb; see Austin #49) with
  separate staging and production.
- [ ] **48. Monitoring and alerts**: uptime checks, error tracking, and an alert on any push to `main`
  that bypasses review.
- [ ] **49. On-chain verification research.** `proof_registry` only anchors hashes. Evaluate an
  UltraHonk verifier on Soroban vs. multi-party attestation, and write up the decision.
- [ ] **50. Update the org profile README** (`.github`) with the security policy, architecture diagram,
  and contribution rules.
