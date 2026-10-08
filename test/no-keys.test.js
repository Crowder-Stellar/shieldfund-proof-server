// #33: with no PROVE_API_KEYS configured the endpoint fails closed.
process.env.LOG_LEVEL = "silent";
process.env.PROVE_API_KEYS = "";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/server");

test("/api/prove refuses everything when no API keys are configured", async () => {
  for (const key of [undefined, "", "anything"]) {
    const req = request(app).post("/api/prove");
    if (key !== undefined) req.set("X-API-Key", key);
    const res = await req.send({}).expect(503);
    assert.match(res.body.error, /no API keys configured/);
  }
});
