# Ndii's Tasks — shieldfund-proof-server & Crowder-Stellar org

Owner/lead tasks following the 2026-09-22 force-push incident on `shieldfund-proof-server`, plus the
cross-repo and org-level work that only an owner can do. Austin's list is in
[`AUSTINS_TASK.md`](./AUSTINS_TASK.md).

Priority: **P0** = now · **P1** = this sprint · **P2** = next sprint

---

## 0. Incident cleanup (P0)

- [ ] **1. Restore clean `main`.** Force-push the clean commit over the tampered one:
  `git push --force-with-lease=main:0819bd7 origin main` (local `main` is the clean `7a56d35` + this file).
- [ ] **2. Verify the payload is gone** on GitHub: `src/server.js` must end at `module.exports = app;` with
  no trailing whitespace run.
- [ ] **3. Protect `main` on this repo** (no force-push, no deletion, 1 approving review, enforce for
  admins) — the other four repos are already protected.
- [ ] **4. Check for deployments.** Confirm nothing (Render, VPS, a teammate's laptop) ran this repo from
  `origin/main` between 2026-09-22 and the restore. If something did, treat that host as compromised.
- [ ] **5. Talk to Austin directly** (not over GitHub) and walk through Section 0 of his list with him.
- [ ] **6. Secure your own account too**: rotate your PATs, review authorized OAuth apps, confirm 2FA.

## 1. Org security settings (P0)

- [ ] **7. Require 2FA for all members** (org Settings → Authentication security).
- [ ] **8. Enable secret scanning + push protection** for all repos, and for new repos by default.
- [ ] **9. Enable Dependabot alerts and security updates** org-wide.
- [ ] **10. Restrict destructive member permissions**: turn off "members can delete repositories" and
  "members can change repository visibility".
- [ ] **11. Review the org audit log** for 2026-09-01 → now: any other force-pushes, new tokens, new apps,
  membership or permission changes.
- [ ] **12. Consider an org ruleset** instead of per-repo branch protection, so every new repo gets
  protected `main` automatically.

## 2. Review & ownership (P1)

- [ ] **13. Review Austin's PRs** against `AUSTINS_TASK.md`, P0 sections first; pay extra attention to
  `.github/workflows/` and anything that touches `circuits/`.
- [ ] **14. Decide salt handling** with Austin (his task #30): caller-supplied salt only, or salt returned
  to an authenticated admin only.
- [ ] **15. Decide the auth model** for `/api/prove` (his task #33): API key, signed requests, or only
  callable from `shieldfund-backend` on a private network.

## 3. Cross-repo integration (P1)

- [ ] **16. Re-deploy `proof_registry`** once the circuit fixes land (Austin #17, #19, #20) — changed
  circuits mean a new verification key; old proof hashes stay valid only for the old circuit.
- [ ] **17. Close the anchoring loop.** The server returns `proofHash` but nothing calls
  `proof_registry::register_proof()` automatically. Decide whether `shieldfund-backend` or this server
  submits it, and restrict the submitter address on-chain.
- [ ] **18. Wire `shieldfund-backend`** to call this server instead of accepting arbitrary proof hashes.
- [ ] **19. Frontend:** confirm `ManualVerificationModal` in `shieldfund-frontend` handles the new 400
  validation errors and the auth requirement.

## 4. Roadmap (P2)

- [ ] **20. On-chain verification research.** The README states the trust gap: `proof_registry` only
  anchors hashes. Evaluate an UltraHonk verifier on Soroban vs. a multi-party attestation scheme, and write
  up the decision.
- [ ] **21. Raise allowlist capacity** beyond 16 (`DEPTH`) once in-process hashing (Austin #42) makes
  bigger trees practical.
- [ ] **22. Hosting:** pick where the proof server runs (needs nargo + bb; see Austin #49 Dockerfile) and
  set up monitoring/alerts.
- [ ] **23. Update the org profile README** (`.github`) with the security policy and contribution rules
  (PR-only, reviews required).
