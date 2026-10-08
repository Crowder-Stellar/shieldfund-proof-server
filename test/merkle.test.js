process.env.TREE_CACHE_SIZE = "2";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// A readable fake hash, so these tests check the tree's shape and paths
// without any cryptography. Must be installed before merkle.js loads it;
// tests swap `hashImpl` to change behaviour. test/pedersen.test.js covers
// the real hash.
const pedersen = require("../src/pedersen");
const fakeHash = async (a, b) => `h(${a},${b})`;
let hashImpl = fakeHash;
let hashCalls = 0;
pedersen.hashPair = (a, b) => {
  hashCalls++;
  return hashImpl(a, b);
};

const { buildAllowlistTree, treeCache, PADDING_ID } = require("../src/merkle");
const { MERKLE_DEPTH, MAX_ALLOWLIST_SIZE } = require("../src/config");

const leaf = (id) => `h(1,${id})`;

// Recomputes the root exactly the way the circuit does.
function rootFromPath(id, { path, directions }) {
  let current = leaf(id);
  path.forEach((sibling, i) => {
    current = directions[i] ? `h(${sibling},${current})` : `h(${current},${sibling})`;
  });
  return current;
}

beforeEach(() => {
  treeCache.clear();
  hashImpl = fakeHash;
  hashCalls = 0;
});

test("every member's path recomputes the root", async () => {
  const allowlist = ["42", "7", "1001"];
  const tree = await buildAllowlistTree(allowlist);
  for (const id of allowlist) {
    const proof = tree.pathFor(id);
    assert.equal(proof.path.length, MERKLE_DEPTH);
    assert.equal(proof.directions.length, MERKLE_DEPTH);
    assert.equal(rootFromPath(id, proof), tree.root, id);
  }
});

test("leaves are domain-tagged and unused slots are padded with id 0", async () => {
  const tree = await buildAllowlistTree(["5"]);
  // The only member is the leftmost leaf; its first sibling is a padding leaf.
  assert.deepEqual(tree.pathFor("5").directions, Array(MERKLE_DEPTH).fill(false));
  assert.equal(tree.pathFor("5").path[0], leaf(PADDING_ID));
  assert.ok(tree.root.startsWith(`h(h(h(h(${leaf("5")},${leaf(PADDING_ID)})`));
});

test("a full tree hashes 2^DEPTH leaves plus 2^DEPTH - 1 nodes", async () => {
  const allowlist = Array.from({ length: MAX_ALLOWLIST_SIZE }, (_, i) => String(i + 1));
  const tree = await buildAllowlistTree(allowlist);
  assert.equal(hashCalls, 2 * MAX_ALLOWLIST_SIZE - 1);
  const last = allowlist.at(-1);
  assert.deepEqual(tree.pathFor(last).directions, Array(MERKLE_DEPTH).fill(true));
  assert.equal(rootFromPath(last, tree.pathFor(last)), tree.root);
});

test("pathFor refuses non-members and the padding id", async () => {
  const tree = await buildAllowlistTree(["42"]);
  assert.throws(() => tree.pathFor("43"), /not in the allowlist/);
  assert.throws(() => tree.pathFor(PADDING_ID), /reserved as the padding sentinel/);
});

test("rejects empty, oversized and padding-id allowlists", async () => {
  await assert.rejects(buildAllowlistTree([]), /must not be empty/);
  const tooMany = Array.from({ length: MAX_ALLOWLIST_SIZE + 1 }, (_, i) => String(i + 1));
  await assert.rejects(buildAllowlistTree(tooMany), /exceeds MERKLE_DEPTH/);
  await assert.rejects(buildAllowlistTree(["42", PADDING_ID]), /reserved as the padding sentinel/);
});

test("the cache returns the same tree without rehashing", async () => {
  const first = await buildAllowlistTree(["42", "7"]);
  const calls = hashCalls;
  assert.equal(await buildAllowlistTree(["42", "7"]), first);
  assert.equal(hashCalls, calls);
});

test("the cache evicts the least-recently-used tree", async () => {
  // TREE_CACHE_SIZE is 2 for this file.
  const a = await buildAllowlistTree(["1"]);
  await buildAllowlistTree(["2"]);
  await buildAllowlistTree(["1"]); // touch "1" so "2" is now the oldest
  await buildAllowlistTree(["3"]);
  assert.deepEqual([...treeCache.keys()].sort(), ["1", "3"]);
  assert.equal(await buildAllowlistTree(["1"]), a);
});

test("a failed build is not cached, so the next request retries", async () => {
  hashImpl = async () => {
    throw new Error("wasm crashed");
  };
  await assert.rejects(buildAllowlistTree(["42"]), /wasm crashed/);
  assert.equal(treeCache.size, 0);
  hashImpl = fakeHash;
  assert.match((await buildAllowlistTree(["42"])).root, /^h\(/);
});
