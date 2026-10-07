const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

// Stub the toolchain before proveService/server load it, so these tests are
// fast and can force each failure mode. node --test runs each file in its
// own process, so the stubs don't leak into prove.test.js.
const nargoRunner = require("../src/nargoRunner");
const merkle = require("../src/merkle");

const SECRET_PATH = "/home/runner/.bb/bb: corrupt srs at /srv/proof-server/circuits/payroll_compliance/target";
let proveBehaviour;

merkle.buildAllowlistTree = async () => ({
  root: "0x01",
  pathFor: () => ({ path: Array(4).fill("0x00"), directions: Array(4).fill(0) }),
});
nargoRunner.hashPair = async () => "0x02";
nargoRunner.provePayrollCompliance = async () => proveBehaviour();

const toolchainError = (assertion) => {
  const err = new Error(assertion || SECRET_PATH);
  err.assertion = assertion || null;
  err.stderr = SECRET_PATH;
  err.stdout = "";
  return err;
};

const app = require("../src/server");
const body = {
  recipientId: "42", amount: "1", proofType: "payroll", allowlist: ["42"], budgetCap: "10", budgetSalt: "7",
};

let server, base, logged;
const originalConsoleError = console.error;

before(async () => {
  console.error = (...args) => { logged.push(args.map(String).join(" ")); };
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  console.error = originalConsoleError;
  server.close();
});

async function prove(payload = body, raw) {
  logged = [];
  const res = await fetch(`${base}/api/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(payload),
  });
  return { res, json: await res.json() };
}

test("toolchain failures return a generic 500 with a request id, never the raw output", async () => {
  proveBehaviour = async () => { throw toolchainError(null); };
  const { res, json } = await prove();

  assert.equal(res.status, 500);
  assert.deepEqual(Object.keys(json).sort(), ["error", "requestId"]);
  assert.equal(json.error, "proof generation failed");
  assert.equal(res.headers.get("x-request-id"), json.requestId);
  assert.doesNotMatch(JSON.stringify(json), /\/home|\/srv|bb|srs/);

  // ...but the details are in the server log under the same id.
  const log = logged.join("\n");
  assert.match(log, new RegExp(json.requestId));
  assert.match(log, /corrupt srs/);
});

test("circuit assertion failures are 400s with only the assert message", async () => {
  proveBehaviour = async () => { throw toolchainError("amount exceeds budget cap"); };
  const { res, json } = await prove();

  assert.equal(res.status, 400);
  assert.deepEqual(json, { error: "amount exceeds budget cap" });
  assert.doesNotMatch(JSON.stringify(json), /\/home|\/srv/);
});

test("malformed JSON is a 400, not a 500", async () => {
  const { res, json } = await prove(undefined, "{not json");
  assert.equal(res.status, 400);
  assert.equal(json.error, "invalid JSON body");
  assert.ok(json.requestId);
});

test("every response carries a unique X-Request-Id", async () => {
  const a = await fetch(`${base}/health`);
  const b = await fetch(`${base}/health`);
  assert.match(a.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.notEqual(a.headers.get("x-request-id"), b.headers.get("x-request-id"));
});
