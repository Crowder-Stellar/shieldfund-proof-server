const { buildAllowlistTree } = require("./merkle");
const { provePayrollCompliance } = require("./prover");
const { hashPair } = require("./pedersen");
const { FIELD_MODULUS, hashProof, hashPublicInputs, toFieldHex } = require("./hash");
const { PROOF_TYPES, MAX_ALLOWLIST_SIZE } = require("./config");

class ValidationError extends Error {}

// budgetSalt is what hides budgetCap inside the public budget_commitment, so
// anyone who can guess it can brute-force the cap. Callers generate it once
// per budget (e.g. `openssl rand -hex 31`), keep it secret next to the cap,
// and the server never generates or returns it. Values below 2^120 can't be
// random 248-bit salts (odds ~2^-128), so they are rejected as guessable.
const MIN_SALT_BITS = 120;

// Parses a circuit input into a canonical decimal string. Accepts a decimal
// string, a 0x-hex string, or a safe integer. Rejects anything negative or
// >= the field modulus instead of letting toFieldHex() silently reduce it
// (e.g. amount = p + 5 would otherwise be proved as 5). `maxBits` adds a
// tighter bound for values the circuit casts to an integer type.
function parseField(name, value, { maxBits } = {}) {
  let big;
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    big = BigInt(value);
  } else if (typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value.trim())) {
    big = BigInt(value.trim());
  } else if (typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value.trim())) {
    big = BigInt(value.trim());
  } else {
    throw new ValidationError(`${name} must be a non-negative integer (decimal or 0x-hex)`);
  }
  if (big < 0n || big >= FIELD_MODULUS) {
    throw new ValidationError(`${name} is outside the BN254 scalar field`);
  }
  if (maxBits !== undefined && big >= 1n << BigInt(maxBits)) {
    throw new ValidationError(`${name} must be less than 2^${maxBits}`);
  }
  return big.toString();
}

// Validates and canonicalises every /api/prove input up front, so bad input
// is a clear 400 here rather than a crash deep inside nargo.
function validateProveInput({ recipientId, amount, proofType, allowlist, budgetCap, budgetSalt }) {
  if (typeof proofType !== "string" || !Object.hasOwn(PROOF_TYPES, proofType)) {
    throw new ValidationError(`proofType must be one of: ${Object.keys(PROOF_TYPES).join(", ")}`);
  }
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    throw new ValidationError("allowlist must be a non-empty array of recipientId strings");
  }
  if (allowlist.length > MAX_ALLOWLIST_SIZE) {
    throw new ValidationError(`allowlist may contain at most ${MAX_ALLOWLIST_SIZE} entries`);
  }
  const required = [
    ["recipientId", recipientId],
    ["amount", amount],
    ["budgetCap", budgetCap],
    ["budgetSalt", budgetSalt],
  ];
  for (const [name, value] of required) {
    if (value === undefined || value === null || value === "") throw new ValidationError(`${name} is required`);
  }

  const ids = allowlist.map((id, i) => parseField(`allowlist[${i}]`, id));
  if (new Set(ids).size !== ids.length) throw new ValidationError("allowlist contains duplicate recipientIds");
  // 0 is the Merkle padding leaf, so it would prove membership in any
  // non-full allowlist (see AUSTINS_TASK #19).
  if (ids.includes("0")) throw new ValidationError("recipientId 0 is reserved as the Merkle padding sentinel");
  // Checked separately: a zero recipientId absent from the allowlist would
  // otherwise match a padding slot in pathFor().
  const recipient = parseField("recipientId", recipientId);
  if (recipient === "0") throw new ValidationError("recipientId 0 is reserved as the Merkle padding sentinel");

  const salt = parseField("budgetSalt", budgetSalt);
  if (BigInt(salt) < 1n << BigInt(MIN_SALT_BITS)) {
    throw new ValidationError(
      `budgetSalt must be a random value of at least 2^${MIN_SALT_BITS} (e.g. openssl rand -hex 31); small salts let anyone recover budgetCap`,
    );
  }

  return {
    proofType,
    allowlist: ids,
    recipientId: recipient,
    // The circuit compares these as u128 (see AUSTINS_TASK #17).
    amount: parseField("amount", amount, { maxBits: 128 }),
    budgetCap: parseField("budgetCap", budgetCap, { maxBits: 128 }),
    budgetSalt: salt,
  };
}

// End-to-end: build the allowlist Merkle tree, commit to the budget,
// generate + locally verify a payroll_compliance proof, then anchor-hash it
// the same way shieldfund-contracts' proof_registry expects
// (proof_hash / public_inputs_hash as BytesN<32>, proof_type as a Symbol).
async function proveAndAnchor(input) {
  const { recipientId, amount, proofType, allowlist, budgetCap, budgetSalt } = validateProveInput(input);

  const tree = await buildAllowlistTree(allowlist);
  let pathInfo;
  try {
    pathInfo = tree.pathFor(recipientId);
  } catch (err) {
    throw new ValidationError(err.message);
  }

  const budgetCommitment = await hashPair(budgetCap, budgetSalt);

  const circuitInputs = {
    merkleRoot: tree.root,
    budgetCommitment,
    recipientId,
    amount,
    proofTypeId: PROOF_TYPES[proofType],
    merklePath: pathInfo.path,
    merkleIndex: pathInfo.directions,
    budgetCap,
    budgetSalt,
  };

  let proofResult;
  try {
    proofResult = await provePayrollCompliance(circuitInputs);
  } catch (err) {
    // Assertion failures from the circuit (bad allowlist membership,
    // over-budget amount, unknown proof_type_id) surface as 400s with just
    // the assert() message. Toolchain failures stay errors → generic 500.
    if (err.assertion) throw new ValidationError(err.assertion);
    throw err;
  }

  const proofHash = hashProof(proofResult.proof);
  const publicInputsHash = hashPublicInputs(proofResult.publicInputs);

  return {
    valid: true,
    proofType,
    proofTypeId: PROOF_TYPES[proofType],
    recipientId: toFieldHex(recipientId),
    amount: toFieldHex(amount),
    merkleRoot: tree.root,
    budgetCommitment,
    proofHash,
    publicInputsHash,
    publicInputs: proofResult.publicInputs,
    proofSizeBytes: proofResult.proofSizeBytes,
    provingTimeMs: proofResult.provingTimeMs,
    scheme: proofResult.scheme,
    bbVersion: proofResult.bbVersion,
  };
}

module.exports = { proveAndAnchor, validateProveInput, ValidationError, MIN_SALT_BITS };
