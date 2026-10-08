process.env.LOG_LEVEL = "silent";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { isValidAccountId } = require("../src/stellar");
const app = require("../src/server");

// README example and the all-zero ed25519 key.
const VALID = "GBJ5FP5UB4YUE2EONTPPSAGKZZGDETFZLEJXJRCALSYTJZIDVWAN3C7P";
const ZERO = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

let server, base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (body) =>
  fetch(`${base}/api/address-to-field`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("accepts valid Stellar account ids", () => {
  assert.equal(isValidAccountId(VALID), true);
  assert.equal(isValidAccountId(ZERO), true);
});

test("rejects bad checksums, wrong prefixes, lengths, alphabets and types", () => {
  const flipped = VALID.slice(0, 10) + (VALID[10] === "A" ? "B" : "A") + VALID.slice(11);
  for (const bad of [
    flipped,
    ZERO.slice(0, -1) + "G", // checksum off by one
    "S" + ZERO.slice(1), // secret-key prefix
    VALID.slice(0, -1), // 55 chars
    VALID + "A", // 57 chars
    VALID.toLowerCase(),
    VALID.slice(0, -1) + "1", // '1' is not base32
    "hello",
    "",
    42,
    [VALID],
    { address: VALID },
  ]) {
    assert.equal(isValidAccountId(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("/api/address-to-field derives an id only for valid addresses", async () => {
  const ok = await post({ address: VALID });
  assert.equal(ok.status, 200);
  const json = await ok.json();
  assert.equal(json.address, VALID);
  assert.match(json.recipientId, /^0x[0-9a-f]{64}$/);

  for (const address of ["not-an-address", "S" + ZERO.slice(1), 123, [VALID]]) {
    const res = await post({ address });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(address)}`);
    assert.match((await res.json()).error, /valid Stellar account id/);
  }
  assert.equal((await post({})).status, 400);
});
