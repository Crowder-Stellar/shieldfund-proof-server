const { BarretenbergSync, BackendType } = require("@aztec/bb.js");
const { toFieldHex } = require("./hash");

// In-process Pedersen via Barretenberg's own WASM build (@aztec/bb.js, pinned
// to the same version as the bb binary). This is the exact
// std::hash::pedersen_hash the circuits use, so the allowlist tree built here
// matches what payroll_compliance recomputes — test/pedersen.test.js checks
// that against the hash_util circuit. ~1ms per hash instead of ~1s per
// `nargo execute` subprocess.
let instance;
function barretenberg() {
  instance ??= BarretenbergSync.new({ backend: BackendType.Wasm });
  return instance;
}

const toBytes = (value) => Buffer.from(toFieldHex(value).slice(2), "hex");

// pedersen_hash([a, b]) as a 0x-prefixed 32-byte hex string.
async function hashPair(a, b) {
  const bb = await barretenberg();
  const { hash } = bb.pedersenHash({ inputs: [toBytes(a), toBytes(b)], hashIndex: 0 });
  return "0x" + Buffer.from(hash).toString("hex");
}

module.exports = { hashPair };
