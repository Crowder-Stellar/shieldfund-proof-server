const { test } = require("node:test");
const assert = require("node:assert/strict");
const { proofByteLength } = require("../src/hash");

// Fast, no nargo/bb needed.
test("proofByteLength counts 32 bytes per field element, not JSON characters (#32)", () => {
  const proof = ["0x01", "0x" + "ab".repeat(32), "0x0"];
  assert.equal(proofByteLength(proof), 96);
  assert.notEqual(proofByteLength(proof), JSON.stringify(proof).length);
  assert.equal(proofByteLength([]), 0);
});

test("proofByteLength rejects values that aren't field elements", () => {
  assert.throws(() => proofByteLength(["0x" + "00".repeat(33)]), /not a field element/);
  assert.throws(() => proofByteLength(["12"]), /not a field element/);
});
