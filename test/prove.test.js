const { test } = require("node:test");
const assert = require("node:assert/strict");
const { proveAndAnchor, ValidationError } = require("../src/proveService");

// These hit the real nargo/bb toolchain — slow (tree build + proving), not
// mocked. Run with: npm test
test("valid payroll proof: proves, verifies, and hashes", async () => {
  const result = await proveAndAnchor({
    recipientId: "42",
    amount: "500000",
    proofType: "payroll",
    allowlist: ["42", "7", "1001"],
    budgetCap: "1000000",
    budgetSalt: "777",
  });

  assert.equal(result.valid, true);
  assert.match(result.proofHash, /^0x[0-9a-f]{64}$/);
  assert.match(result.publicInputsHash, /^0x[0-9a-f]{64}$/);
  assert.equal(result.publicInputs.length, 5);
});

test("rejects amount over budget cap", async () => {
  await assert.rejects(
    proveAndAnchor({
      recipientId: "42",
      amount: "2000000",
      proofType: "payroll",
      allowlist: ["42", "7", "1001"],
      budgetCap: "1000000",
      budgetSalt: "777",
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
      budgetSalt: "777",
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
      budgetSalt: "777",
    }),
    ValidationError,
  );
});
