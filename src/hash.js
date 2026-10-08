const { keccak256 } = require("js-sha3");

// Barretenberg / Grumpkin scalar field modulus — every Field value the
// circuits work with (leaves, commitments, roots) lives in this field.
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function toFieldHex(value) {
  const big = typeof value === "bigint" ? value : BigInt(value);
  const mod = ((big % FIELD_MODULUS) + FIELD_MODULUS) % FIELD_MODULUS;
  return "0x" + mod.toString(16).padStart(64, "0");
}

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, "");
  const padded = clean.length % 2 === 0 ? clean : "0" + clean;
  return Buffer.from(padded, "hex");
}

function fieldHexTo32Bytes(hex) {
  const clean = hex.replace(/^0x/, "").padStart(64, "0");
  return Buffer.from(clean.slice(-64), "hex");
}

// Deterministic 32-byte anchor hash of a bb proof (list of field-element hex
// strings), suitable for proof_registry::register_proof's `proof_hash:
// BytesN<32>`. This is a content hash for uniqueness/anchoring, not a
// commitment scheme with specific byte-packing requirements.
function hashProof(proofFieldsHex) {
  const bytes = Buffer.concat(proofFieldsHex.map(hexToBytes));
  return "0x" + keccak256(bytes);
}

// 32-byte hash of the ordered public inputs, for `public_inputs_hash:
// BytesN<32>` — lets a third party re-derive and check which public inputs a
// registered proof corresponds to.
function hashPublicInputs(publicInputsHex) {
  const bytes = Buffer.concat(publicInputsHex.map(fieldHexTo32Bytes));
  return "0x" + keccak256(bytes);
}

// Convenience: derive a Field-safe recipient id from an arbitrary string
// (e.g. a Stellar G... address) when the caller doesn't already have one.
function addressToField(address) {
  const digest = keccak256(Buffer.from(address, "utf8"));
  return toFieldHex(BigInt("0x" + digest));
}

// bb serializes every proof field element as 32 bytes, so that is the proof's
// real size — not the length of its JSON/hex encoding.
const FIELD_BYTES = 32;
function proofByteLength(proofFieldsHex) {
  for (const hex of proofFieldsHex) {
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(hex)) throw new Error(`not a field element: ${hex}`);
  }
  return proofFieldsHex.length * FIELD_BYTES;
}

module.exports = {
  FIELD_MODULUS,
  proofByteLength,
  toFieldHex,
  hashProof,
  hashPublicInputs,
  addressToField,
};
