const { test } = require("node:test");
const assert = require("node:assert/strict");
const { keccak256 } = require("js-sha3");
const {
  FIELD_MODULUS,
  toFieldHex,
  hashProof,
  hashPublicInputs,
  addressToField,
  proofByteLength,
} = require("../src/hash");

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

test("toFieldHex gives 0x + 64 hex digits, reduced into the field", () => {
  assert.equal(toFieldHex(42), "0x" + "2a".padStart(64, "0"));
  assert.equal(toFieldHex("0x2A"), toFieldHex(42n));
  assert.equal(toFieldHex(FIELD_MODULUS), toFieldHex(0));
  assert.equal(toFieldHex(FIELD_MODULUS + 5n), toFieldHex(5));
  // Negative values wrap — which is why proveService rejects them before
  // they ever get here (see validation.test.js).
  assert.equal(toFieldHex(-1n), toFieldHex(FIELD_MODULUS - 1n));
});

test("hashProof is keccak256 over the proof's raw bytes", () => {
  // keccak256 of the two bytes 0x01 0xff.
  const expected = "0x" + keccak256(Buffer.from([0x01, 0xff]));
  assert.equal(hashProof(["0x01", "0xff"]), expected);
  assert.equal(hashProof(["0x1", "0xff"]), expected); // odd-length hex is left-padded
  assert.notEqual(hashProof(["0xff", "0x01"]), expected); // order matters
  assert.match(hashProof(["0x01"]), /^0x[0-9a-f]{64}$/);
});

test("hashPublicInputs hashes each input as a 32-byte word", () => {
  const word = (n) => Buffer.from(n.toString(16).padStart(64, "0"), "hex");
  const expected = "0x" + keccak256(Buffer.concat([word(1), word(42)]));
  assert.equal(hashPublicInputs(["0x01", "0x2a"]), expected);
  assert.equal(hashPublicInputs([toFieldHex(1), toFieldHex(42)]), expected);
  assert.notEqual(hashPublicInputs(["0x2a", "0x01"]), expected);
});

test("addressToField is deterministic, distinct per address, and a valid field element", () => {
  const a = "GBJ5FP5UB4YUE2EONTPPSAGKZZGDETFZLEJXJRCALSYTJZIDVWAN3C7P";
  const b = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
  assert.equal(addressToField(a), addressToField(a));
  assert.notEqual(addressToField(a), addressToField(b));
  assert.match(addressToField(a), /^0x[0-9a-f]{64}$/);
  assert.ok(BigInt(addressToField(a)) < FIELD_MODULUS);
  assert.equal(addressToField(a), toFieldHex(BigInt("0x" + keccak256(a))));
});
