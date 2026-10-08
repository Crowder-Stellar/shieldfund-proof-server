// #34: the per-IP limit runs before auth, so it also throttles key guessing.
// Own file (= own process) because the limiters are per-process.
process.env.LOG_LEVEL = "silent";
process.env.PROVE_API_KEYS = "key";
process.env.PROVE_RATE_LIMIT_PER_IP = "3";
process.env.PROVE_RATE_LIMIT_PER_KEY = "1000";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/server");

test("the per-IP limit applies to unauthenticated requests too", async () => {
  for (let i = 0; i < 3; i++) await request(app).post("/api/prove").set("X-API-Key", `guess-${i}`).send({}).expect(401);
  const limited = await request(app).post("/api/prove").set("X-API-Key", "key").send({}).expect(429);
  assert.match(limited.body.error, /too many proof requests/);
  assert.ok(limited.headers["ratelimit-policy"]);
  // Other routes are not rate limited by the prove limiter.
  await request(app).get("/health").expect(200);
});
