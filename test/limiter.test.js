const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLimiter } = require("../src/limiter");

const tick = () => new Promise((r) => setImmediate(r));

test("never runs more than `max` tasks at once, and runs them all", async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  const task = (i) => limit(async () => {
    active++;
    peak = Math.max(peak, active);
    await tick();
    active--;
    return i;
  });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => task(i)));
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(peak, 2);
});

test("a newcomer can't take a slot that is being handed to a waiter", async () => {
  // Arrive at each microtask offset around the moment the running task
  // releases its slot; one of them lands between the release and the
  // waiter waking up, which is where a naive limiter double-books.
  for (let depth = 0; depth < 8; depth++) {
    const limit = createLimiter(1);
    let active = 0;
    let peak = 0;
    const body = async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
    };
    let newcomer;
    const first = limit(async () => {
      let p = Promise.resolve();
      for (let i = 0; i < depth; i++) p = p.then(() => {});
      p.then(() => { newcomer = limit(body); });
    });
    const waiter = limit(body);
    await Promise.all([first, waiter]);
    await tick();
    await newcomer;
    assert.equal(peak, 1, `newcomer at microtask offset ${depth}`);
  }
});

test("a failing task frees its slot", async () => {
  const limit = createLimiter(1);
  await assert.rejects(limit(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await limit(async () => "next"), "next");
});

test("waiting tasks start in the order they arrived", async () => {
  const limit = createLimiter(1);
  const order = [];
  await Promise.all([1, 2, 3, 4].map((i) => limit(async () => { order.push(i); await tick(); })));
  assert.deepEqual(order, [1, 2, 3, 4]);
});
