const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomFieldSalt, FIELD_MODULUS } = require("../src/hash");

// Fast, no nargo/bb needed.
test("randomFieldSalt returns decimal Field elements below the modulus", () => {
  for (let i = 0; i < 200; i++) {
    const salt = randomFieldSalt();
    assert.match(salt, /^\d+$/);
    const value = BigInt(salt);
    assert.ok(value >= 0n && value < FIELD_MODULUS);
    assert.ok(value < 2n ** 248n);
  }
});

test("randomFieldSalt is not time-derived or repeated", () => {
  const salts = new Set(Array.from({ length: 1000 }, randomFieldSalt));
  assert.equal(salts.size, 1000);
  // The old scheme was Date.now() * 1e6 + small noise (~2^60); real salts
  // are ~248 bits, so essentially none should fit in 64 bits.
  const small = [...salts].filter((s) => BigInt(s) < 2n ** 64n);
  assert.equal(small.length, 0);
});
