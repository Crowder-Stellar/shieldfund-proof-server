# Security Policy

## Reporting a vulnerability

**Please do not open a public issue, PR, or discussion for security problems.**

Report privately through GitHub:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**
   (direct link: <https://github.com/Crowder-Stellar/shieldfund-proof-server/security/advisories/new>).
3. Describe the issue, the affected file(s) or endpoint, and steps or a proof of concept to reproduce it.

Only the maintainers can see the report. If you can't use GitHub's private reporting, open a public issue
that says only "please contact me about a security issue" — no details — and a maintainer will reach out.

## What to expect

| Step | Target |
|------|--------|
| Acknowledge your report | within **3 business days** |
| Initial assessment (confirmed / not a vulnerability / need more info) | within **7 days** |
| Fix released, or a remediation plan agreed with you | within **30 days** |

We'll keep you updated in the advisory thread, credit you in the advisory and release notes unless you
prefer otherwise, and ask that you hold off on public disclosure until a fix is out or 90 days have passed,
whichever comes first.

## Scope

In scope:

- **Circuits** (`circuits/`) — anything that lets a proof verify for a false statement (soundness bugs,
  e.g. value truncation, Merkle/allowlist bypasses, hash collisions between leaves and nodes).
- **Proof server** (`src/`) — input validation bypasses, leaking secrets (budget cap, salts), denial of
  service, command or path injection into `nargo`/`bb`.
- **Supply chain / CI** (`.github/`, `scripts/`, `package*.json`) — anything that lets untrusted code run
  in CI or end up in `main`.

Out of scope: issues in upstream Noir, Barretenberg, or Stellar/Soroban themselves (please report those
upstream), and findings that need an already-compromised maintainer account or machine.

## Supported versions

This project is pre-1.0. Only the latest commit on `main` is supported; fixes are not backported.
