process.env.LOG_LEVEL = "silent";
process.env.PROVE_API_KEYS = "key-one, key-two";
process.env.PROVE_RATE_LIMIT_PER_IP = "100";
process.env.PROVE_RATE_LIMIT_PER_KEY = "3";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");

const proveService = require("../src/proveService");
let proveCalls;
proveService.proveAndAnchor = async () => { proveCalls++; return { valid: true }; };

const app = require("../src/server");
const { createLogger } = require("../src/logger");
const { run } = require("../src/nargoRunner");

const body = { recipientId: "42", amount: "1", proofType: "payroll", allowlist: ["42"], budgetCap: "10" };
let server, base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => { proveCalls = 0; });

function prove({ key, payload = body, raw } = {}) {
  const headers = { "content-type": "application/json" };
  if (key) headers["x-api-key"] = key;
  return fetch(`${base}/api/prove`, { method: "POST", headers, body: raw ?? JSON.stringify(payload) });
}

test("/api/prove rejects missing and wrong API keys before doing any work", async () => {
  const missing = await prove();
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, "missing X-API-Key header");

  const wrong = await prove({ key: "key-three" });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, "invalid API key");

  assert.equal(proveCalls, 0);
});

test("/api/prove accepts any configured key", async () => {
  for (const key of ["key-one", "key-two"]) {
    const res = await prove({ key });
    assert.equal(res.status, 200, key);
  }
  assert.equal(proveCalls, 2);
});

test("/api/prove is rate limited per API key", async () => {
  // key-two already used 1 of its 3 requests in the previous test.
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await prove({ key: "key-two" })).status);
  assert.deepEqual(statuses, [200, 200, 429]);
  const limited = await prove({ key: "key-two" });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("ratelimit-policy"));
  // A different key has its own budget.
  assert.equal((await prove({ key: "key-one" })).status, 200);
});

test("bodies over 32kb are a 413", async () => {
  const res = await prove({ key: "key-one", raw: JSON.stringify({ ...body, pad: "x".repeat(33 * 1024) }) });
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /exceeds 32kb/);
  assert.equal(proveCalls, 0);
});

test("security headers are set and x-powered-by is not", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(res.headers.get("content-security-policy"));
  assert.ok(res.headers.get("strict-transport-security"));
});

test("the logger redacts budget caps, salts and API keys", () => {
  let out = "";
  const sink = new Writable({ write(chunk, _enc, cb) { out += chunk; cb(); } });
  const log = createLogger(sink, "info");
  log.info({ budgetCap: "123456789", input: { budgetSalt: "987654321" }, req: { headers: { "x-api-key": "key-one" } } });
  assert.doesNotMatch(out, /123456789|987654321|key-one/);
  assert.match(out, /\[redacted\]/);
});

test("subprocesses that hang are killed after the timeout", async () => {
  const started = Date.now();
  await assert.rejects(run(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], __dirname, 200), (err) => {
    assert.match(err.message, /timed out after 200ms/);
    assert.equal(err.assertion, null);
    return true;
  });
  assert.ok(Date.now() - started < 5000);
});
