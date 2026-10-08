const { hashPair } = require("./nargoRunner");
const { MERKLE_DEPTH, MAX_ALLOWLIST_SIZE } = require("./config");

// recipientId "0" is reserved as the padding sentinel for unused allowlist
// slots — real recipients must never be assigned id 0.
const PADDING_ID = "0";

// Domain tag for leaves, so a leaf hash can never equal an internal node
// hash. Must match LEAF_DOMAIN in circuits/payroll_compliance/src/main.nr.
const LEAF_DOMAIN = "1";

function leafOf(recipientId) {
  return hashPair(LEAF_DOMAIN, recipientId);
}

// Builds the fixed-depth (MERKLE_DEPTH) Merkle tree over an allowlist,
// padding unused slots with the zero sentinel, using the same hash_util
// pedersen_hash the payroll_compliance circuit recomputes internally.
// Returns the root plus a lookup for each recipient's inclusion path.
async function buildAllowlistTree(allowlist) {
  if (allowlist.length === 0) throw new Error("allowlist must not be empty");
  if (allowlist.length > MAX_ALLOWLIST_SIZE) {
    throw new Error(`allowlist exceeds MERKLE_DEPTH=${MERKLE_DEPTH} capacity of ${MAX_ALLOWLIST_SIZE}`);
  }
  if (allowlist.some((id) => id === PADDING_ID)) {
    throw new Error(`recipientId "${PADDING_ID}" is reserved as the padding sentinel`);
  }

  const ids = allowlist.slice();
  while (ids.length < MAX_ALLOWLIST_SIZE) ids.push(PADDING_ID);

  let level = [];
  for (const id of ids) level.push(await leafOf(id));

  const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(await hashPair(level[i], level[i + 1]));
    }
    levels.push(next);
    level = next;
  }

  const root = level[0];

  function pathFor(recipientId) {
    const index = ids.indexOf(recipientId);
    if (index === -1) throw new Error(`recipientId "${recipientId}" is not in the allowlist`);

    let idx = index;
    const path = [];
    const directions = [];
    for (let d = 0; d < MERKLE_DEPTH; d++) {
      const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
      path.push(levels[d][siblingIndex]);
      directions.push(idx % 2 === 1); // true = current node is the right child
      idx = Math.floor(idx / 2);
    }
    return { path, directions };
  }

  return { root, pathFor };
}

module.exports = { buildAllowlistTree, PADDING_ID };
