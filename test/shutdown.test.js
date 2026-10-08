process.env.LOG_LEVEL = "silent";
process.env.PROVE_API_KEYS = "test-key";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const proveService = require("../src/proveService");
let releaseProof;
proveService.proveAndAnchor = () =>
  new Promise((resolve) => {
    releaseProof = () => resolve({ valid: true });
  });

const app = require("../src/server");

test("shutdown lets the in-flight proof finish, refuses new requests, then exits", async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const inFlight = fetch(`${base}/api/prove`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-key" },
    body: "{}",
  });
  while (!releaseProof) await new Promise((r) => setTimeout(r, 5));

  let exitCode;
  const exited = new Promise((r) => {
    app.shutdown(server, "SIGTERM", (code) => {
      exitCode = code;
      r();
    });
  });

  // The listener is closed, so new connections are refused outright.
  await assert.rejects(fetch(`${base}/health`, { headers: { connection: "close" } }));
  assert.equal(exitCode, undefined, "must not exit while a proof is in flight");

  releaseProof();
  const res = await inFlight;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { valid: true });

  await exited;
  assert.equal(exitCode, 0);
});
