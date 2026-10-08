const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateProveInput, proveAndAnchor, ValidationError } = require("../src/proveService");
const { FIELD_MODULUS } = require("../src/hash");

// Fast — validation runs before any nargo/bb call.
const base = {
  recipientId: "42", amount: "500000", proofType: "payroll",
  allowlist: ["42", "7"], budgetCap: "1000000", budgetSalt: "777",
};
const rejects = (patch, pattern) =>
  assert.throws(() => validateProveInput({ ...base, ...patch }), (e) => e instanceof ValidationError && pattern.test(e.message));

test("canonicalises decimal, hex and number inputs to decimal strings", () => {
  const v = validateProveInput({ ...base, recipientId: "0x2a", amount: 500000, allowlist: ["0x2A", " 7 "] });
  assert.equal(v.recipientId, "42");
  assert.equal(v.amount, "500000");
  assert.deepEqual(v.allowlist, ["42", "7"]);
  assert.equal(v.budgetSalt, "777");
});

test("proofType must be an own key of PROOF_TYPES, not an inherited one or an array", () => {
  for (const proofType of ["toString", "__proto__", "constructor", ["payroll"], 0, undefined]) {
    rejects({ proofType }, /proofType must be one of/);
  }
});

test("budgetCap, amount and recipientId are required", () => {
  rejects({ budgetCap: undefined }, /budgetCap is required/);
  rejects({ amount: "" }, /amount is required/);
  rejects({ recipientId: null }, /recipientId is required/);
});

test("rejects non-integer, negative and malformed values instead of crashing", () => {
  rejects({ amount: "abc" }, /amount must be a non-negative integer/);
  rejects({ amount: "-1" }, /amount must be a non-negative integer/);
  rejects({ amount: "1.5" }, /amount must be a non-negative integer/);
  rejects({ amount: 1.5 }, /amount must be a non-negative integer/);
  rejects({ budgetCap: "0x" }, /budgetCap must be a non-negative integer/);
  rejects({ recipientId: { id: 1 } }, /recipientId must be a non-negative integer/);
  rejects({ budgetSalt: "salt" }, /budgetSalt must be a non-negative integer/);
});

test("rejects values that would silently wrap modulo the field", () => {
  rejects({ recipientId: FIELD_MODULUS.toString() }, /outside the BN254 scalar field/);
  rejects({ recipientId: (FIELD_MODULUS + 42n).toString() }, /outside the BN254 scalar field/);
  assert.equal(validateProveInput({ ...base, recipientId: (FIELD_MODULUS - 1n).toString(), allowlist: ["1"] }).recipientId,
    (FIELD_MODULUS - 1n).toString());
});

test("amount and budgetCap must fit in u128", () => {
  rejects({ amount: (1n << 128n).toString() }, /amount must be less than 2\^128/);
  rejects({ budgetCap: (1n << 200n).toString() }, /budgetCap must be less than 2\^128/);
  assert.equal(validateProveInput({ ...base, budgetCap: ((1n << 128n) - 1n).toString() }).budgetCap, ((1n << 128n) - 1n).toString());
});

test("allowlist entries are validated, bounded and de-duplicated", () => {
  rejects({ allowlist: ["42", "x"] }, /allowlist\[1\] must be a non-negative integer/);
  rejects({ allowlist: ["42", "0x2a"] }, /duplicate/);
  rejects({ allowlist: Array.from({ length: 17 }, (_, i) => String(i + 1)) }, /at most 16/);
});

test("recipient 0 (the Merkle padding leaf) is rejected in any spelling", async () => {
  // merkle.js only compared against the string "0", so "0x0" / "0x00" slipped past.
  for (const zero of ["0", "0x0", "0x00", 0]) {
    rejects({ recipientId: zero, allowlist: [zero] }, /reserved as the Merkle padding sentinel/);
  }
  await assert.rejects(proveAndAnchor({ ...base, recipientId: "0x0", allowlist: ["0x00"] }), ValidationError);
});
