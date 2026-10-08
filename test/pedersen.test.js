const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Noir } = require("@noir-lang/noir_js");
const { hashPair } = require("../src/pedersen");
const { buildAllowlistTree, treeCache } = require("../src/merkle");
const { HASH_UTIL_DIR, NARGO_BIN } = require("../src/config");
const { FIELD_MODULUS } = require("../src/hash");

// #42: in-process Pedersen must equal the circuit's std::hash::pedersen_hash,
// or every allowlist root is wrong. Checked against the hash_util circuit
// executed by noir_js (nargo is only needed to compile it once).
test("in-process pedersen matches the hash_util circuit", async () => {
  const artifactPath = path.join(HASH_UTIL_DIR, "target", "hash_util.json");
  if (!fs.existsSync(artifactPath)) execFileSync(NARGO_BIN, ["compile"], { cwd: HASH_UTIL_DIR });
  const noir = new Noir(JSON.parse(fs.readFileSync(artifactPath, "utf8")));

  const pairs = [
    ["1", "42"], // a leaf
    ["0", "0"],
    ["1", "0"], // the padding leaf
    ["0x2a", "1001"],
    [(FIELD_MODULUS - 1n).toString(), "123456789"],
  ];
  for (const [a, b] of pairs) {
    const { returnValue } = await noir.execute({ a, b });
    assert.equal(BigInt(await hashPair(a, b)), BigInt(returnValue), `pedersen(${a}, ${b})`);
  }
});

test("a full 16-leaf tree builds in well under a second", async () => {
  await hashPair("0", "0"); // exclude one-time WASM start-up
  const allowlist = Array.from({ length: 16 }, (_, i) => String(i + 1));
  const started = performance.now();
  const tree = await buildAllowlistTree(allowlist);
  const ms = performance.now() - started;
  assert.match(tree.root, /^0x[0-9a-f]{64}$/);
  assert.ok(ms < 1000, `took ${ms}ms`);
});

// #43
test("repeat proofs against the same allowlist reuse the cached tree", async () => {
  treeCache.clear();
  const a = await buildAllowlistTree(["42", "7"]);
  const b = await buildAllowlistTree(["42", "7"]);
  const c = await buildAllowlistTree(["7", "42"]);
  assert.equal(a, b);
  assert.notEqual(a, c); // order changes the tree, so it's a different entry
  assert.notEqual(a.root, c.root);
  assert.equal(treeCache.size, 2);
});
