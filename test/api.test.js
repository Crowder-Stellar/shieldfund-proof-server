// HTTP-level tests for every client-error path on the API (sections 3-5 of
// AUSTINS_TASK.md). Validation and the Merkle tree are real; only the bb
// proving step is stubbed, so this runs in a second without the toolchain.
process.env.LOG_LEVEL = "silent";
process.env.PROVE_API_KEYS = "api-test-key";
process.env.PROVE_RATE_LIMIT_PER_IP = "1000";
process.env.PROVE_RATE_LIMIT_PER_KEY = "1000";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const prover = require("../src/prover");
let proverBehaviour;
let proverCalls;
prover.provePayrollCompliance = async (inputs) => {
  proverCalls++;
  return proverBehaviour(inputs);
};

const app = require("../src/server");
const { FIELD_MODULUS } = require("../src/hash");

const KEY = "api-test-key";
const SALT = "0x1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79";
const valid = {
  recipientId: "42",
  amount: "500000",
  proofType: "payroll",
  allowlist: ["42", "7", "1001"],
  budgetCap: "1000000",
  budgetSalt: SALT,
};
const fakeProof = {
  proof: ["0x01", "0x02"],
  publicInputs: ["0x01"],
  vkHash: "0x00",
  bbVersion: "test",
  scheme: "ultra_honk",
  provingTimeMs: 1,
  proofSizeBytes: 64,
};

beforeEach(() => {
  proverCalls = 0;
  proverBehaviour = async () => fakeProof;
});

const prove = (body, key = KEY) => {
  const req = request(app).post("/api/prove");
  if (key) req.set("X-API-Key", key);
  return req.send(body);
};

// Every case must be a 400 with this message and must never reach the prover.
async function expect400(patch, pattern) {
  const body = typeof patch === "function" ? patch({ ...valid }) : { ...valid, ...patch };
  const res = await prove(body).expect(400).expect("Content-Type", /json/);
  assert.match(res.body.error, pattern, JSON.stringify(patch));
  assert.equal(proverCalls, 0, `prover ran for ${JSON.stringify(patch)}`);
}

test("a valid request proves and never echoes the salt", async () => {
  const res = await prove(valid).expect(200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.proofType, "payroll");
  assert.equal("budgetSalt" in res.body, false);
  assert.equal(proverCalls, 1);
});

test("#22 recipient 0 is rejected in every spelling", async () => {
  for (const recipientId of ["0", "0x0", "00", "0x00", 0]) {
    await expect400({ recipientId }, /recipientId 0 is reserved|must be a non-negative integer/);
  }
  await expect400({ allowlist: ["42", "0"] }, /recipientId 0 is reserved/);
});

test("#23 ids are normalised: hex and decimal spellings are the same recipient", async () => {
  await prove({ ...valid, recipientId: "0x2a", allowlist: ["0x2A", "7"] }).expect(200);
});

test("#24 duplicate allowlist entries are rejected after normalisation", async () => {
  await expect400({ allowlist: ["42", "42"] }, /duplicate/);
  await expect400({ allowlist: ["42", "0x2a"] }, /duplicate/);
});

test("#25 negative and out-of-range numbers are rejected", async () => {
  await expect400({ amount: "-1" }, /amount must be a non-negative integer/);
  await expect400({ amount: (1n << 128n).toString() }, /amount must be less than 2\^128/);
  await expect400({ budgetCap: (1n << 128n).toString() }, /budgetCap must be less than 2\^128/);
  await expect400({ recipientId: FIELD_MODULUS.toString() }, /outside the BN254 scalar field/);
  await expect400({ allowlist: ["42", FIELD_MODULUS.toString()] }, /allowlist\[1\] is outside the BN254/);
});

test("#26 wrong types are rejected with a 400, not a 500", async () => {
  for (const amount of [1.5, "1.5", "1e6", "", " ", true, ["1"], { n: 1 }, "0x", "12abc"]) {
    await expect400({ amount }, /amount (is required|must be a non-negative integer)/);
  }
  await expect400({ recipientId: ["42"] }, /recipientId must be a non-negative integer/);
  for (const allowlist of ["42", 42, {}, null, []]) {
    await expect400({ allowlist }, /allowlist must be a non-empty array/);
  }
  for (const proofType of ["bogus", "toString", ["payroll"], 0]) {
    await expect400({ proofType }, /proofType must be one of/);
  }
});

test("#27 every required field is checked up front", async () => {
  for (const field of ["recipientId", "amount", "budgetCap", "budgetSalt"]) {
    await expect400(
      (b) => {
        delete b[field];
        return b;
      },
      new RegExp(`${field} is required`),
    );
  }
  await expect400({ allowlist: Array.from({ length: 17 }, (_, i) => String(i + 1)) }, /at most 16 entries/);
});

test("#30 small or malformed salts are rejected", async () => {
  await expect400({ budgetSalt: "777" }, /budgetSalt must be a random value of at least 2\^120/);
  await expect400({ budgetSalt: "salt" }, /budgetSalt must be a non-negative integer/);
});

test("a recipient outside the allowlist is a 400 before proving", async () => {
  await expect400({ recipientId: "999" }, /not in the allowlist/);
});

test("circuit assertion failures are 400s with only the assert message", async () => {
  proverBehaviour = async () => {
    const err = new Error("Circuit execution failed: amount exceeds budget cap\n at /srv/...");
    err.assertion = "amount exceeds budget cap";
    throw err;
  };
  const res = await prove(valid).expect(400);
  assert.deepEqual(res.body, { error: "amount exceeds budget cap" });
});

test("malformed and oversized JSON bodies", async () => {
  const bad = await request(app)
    .post("/api/prove")
    .set("X-API-Key", KEY)
    .set("Content-Type", "application/json")
    .send("{not json")
    .expect(400);
  assert.equal(bad.body.error, "invalid JSON body");

  const big = await prove({ ...valid, pad: "x".repeat(33 * 1024) }).expect(413);
  assert.match(big.body.error, /exceeds 32kb/);
  assert.equal(proverCalls, 0);
});

test("#33 missing or wrong API keys are 401s", async () => {
  assert.equal((await prove(valid, null).expect(401)).body.error, "missing X-API-Key header");
  assert.equal((await prove(valid, "nope").expect(401)).body.error, "invalid API key");
  assert.equal(proverCalls, 0);
});

test("#28 /api/address-to-field only accepts valid Stellar account ids", async () => {
  const ok = "GBJ5FP5UB4YUE2EONTPPSAGKZZGDETFZLEJXJRCALSYTJZIDVWAN3C7P";
  const res = await request(app).post("/api/address-to-field").send({ address: ok }).expect(200);
  assert.match(res.body.recipientId, /^0x[0-9a-f]{64}$/);

  await request(app).post("/api/address-to-field").send({}).expect(400, { error: "address is required" });
  const badChecksum = ok.slice(0, -1) + (ok.endsWith("P") ? "Q" : "P");
  for (const address of [badChecksum, "S" + ok.slice(1), ok.slice(0, -1), ok.toLowerCase(), 42, ["x"]]) {
    const r = await request(app).post("/api/address-to-field").send({ address }).expect(400);
    assert.match(r.body.error, /valid Stellar account id/, String(address));
  }
});
