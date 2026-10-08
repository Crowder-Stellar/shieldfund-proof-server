const { test } = require("node:test");
const assert = require("node:assert/strict");
const { proveAndAnchor, ValidationError } = require("../src/proveService");

const SALT = "0x1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79";

// These hit the real nargo/bb toolchain — slow (tree build + proving), not
// mocked. Run with: npm test
test("valid payroll proof: proves, verifies, and hashes", async () => {
  const result = await proveAndAnchor({
    recipientId: "42",
    amount: "500000",
    proofType: "payroll",
    allowlist: ["42", "7", "1001"],
    budgetCap: "1000000",
    budgetSalt: SALT,
  });

  assert.equal(result.valid, true);
  assert.match(result.proofHash, /^0x[0-9a-f]{64}$/);
  assert.match(result.publicInputsHash, /^0x[0-9a-f]{64}$/);
  assert.equal(result.publicInputs.length, 5);
  // The salt is the caller's secret; echoing it back would leak it (#30).
  assert.equal("budgetSalt" in result, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(BigInt(SALT).toString(16)));
  // 32 bytes per proof field element, not the JSON string length (#32).
  assert.equal(result.proofSizeBytes % 32, 0);
});

test("rejects amount over budget cap", async () => {
  await assert.rejects(
    proveAndAnchor({
      recipientId: "42",
      amount: "2000000",
      proofType: "payroll",
      allowlist: ["42", "7", "1001"],
      budgetCap: "1000000",
      budgetSalt: SALT,
    }),
    (err) => err instanceof ValidationError && /budget/.test(err.message),
  );
});

test("rejects recipient not in allowlist", async () => {
  await assert.rejects(
    proveAndAnchor({
      recipientId: "999",
      amount: "500000",
      proofType: "payroll",
      allowlist: ["42", "7", "1001"],
      budgetCap: "1000000",
      budgetSalt: SALT,
    }),
    (err) => err instanceof ValidationError && /allowlist/.test(err.message),
  );
});

test("rejects unknown proofType before touching the circuit", async () => {
  await assert.rejects(
    proveAndAnchor({
      recipientId: "42",
      amount: "500000",
      proofType: "bogus",
      allowlist: ["42"],
      budgetCap: "1000000",
      budgetSalt: SALT,
    }),
    ValidationError,
  );
});

test("parallel proofs run in separate temp dirs and never touch tracked files (#40, #41)", async () => {
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const os = require("node:os");
  const repo = require("node:path").join(__dirname, "..");
  const tracked = () => execFileSync("git", ["status", "--porcelain", "--", "circuits"], { cwd: repo, encoding: "utf8" });
  const tempDirs = () => fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("shieldfund-proof-"));
  const statusBefore = tracked();
  const tempBefore = tempDirs();

  const results = await Promise.all(["42", "7", "1001"].map((recipientId, i) => proveAndAnchor({
    recipientId,
    amount: String(100000 + i),
    proofType: "payroll",
    allowlist: ["42", "7", "1001"],
    budgetCap: "1000000",
    budgetSalt: SALT,
  })));

  // Each proof is for its own recipient/amount — no cross-talk between requests.
  assert.deepEqual(results.map((r) => BigInt(r.recipientId)), [42n, 7n, 1001n]);
  assert.deepEqual(results.map((r) => BigInt(r.amount)), [100000n, 100001n, 100002n]);
  assert.equal(new Set(results.map((r) => r.proofHash)).size, 3);
  assert.equal(tracked(), statusBefore);
  assert.deepEqual(tempDirs(), tempBefore);
});
