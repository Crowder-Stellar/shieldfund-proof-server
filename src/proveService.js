const { buildAllowlistTree } = require("./merkle");
const { hashPair, provePayrollCompliance } = require("./nargoRunner");
const { hashProof, hashPublicInputs, toFieldHex, randomFieldSalt } = require("./hash");
const { PROOF_TYPES } = require("./config");

class ValidationError extends Error {}

// End-to-end: build the allowlist Merkle tree, commit to the budget,
// generate + locally verify a payroll_compliance proof, then anchor-hash it
// the same way shieldfund-contracts' proof_registry expects
// (proof_hash / public_inputs_hash as BytesN<32>, proof_type as a Symbol).
async function proveAndAnchor({ recipientId, amount, proofType, allowlist, budgetCap, budgetSalt }) {
  if (!(proofType in PROOF_TYPES)) {
    throw new ValidationError(`proofType must be one of: ${Object.keys(PROOF_TYPES).join(", ")}`);
  }
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    throw new ValidationError("allowlist must be a non-empty array of recipientId strings");
  }
  if (recipientId === undefined || amount === undefined) {
    throw new ValidationError("recipientId and amount are required");
  }

  const salt = budgetSalt !== undefined ? budgetSalt : randomFieldSalt();

  const tree = await buildAllowlistTree(allowlist);
  let pathInfo;
  try {
    pathInfo = tree.pathFor(recipientId);
  } catch (err) {
    throw new ValidationError(err.message);
  }

  const budgetCommitment = await hashPair(budgetCap, salt);

  const circuitInputs = {
    merkleRoot: tree.root,
    budgetCommitment,
    recipientId,
    amount,
    proofTypeId: PROOF_TYPES[proofType],
    merklePath: pathInfo.path,
    merkleIndex: pathInfo.directions,
    budgetCap,
    budgetSalt: salt,
  };

  let proofResult;
  try {
    proofResult = await provePayrollCompliance(circuitInputs);
  } catch (err) {
    // Assertion failures from the circuit (bad allowlist membership,
    // over-budget amount, unknown proof_type_id) surface as 400s, not 500s.
    throw new ValidationError(err.message);
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
    budgetSalt: salt,
    proofHash,
    publicInputsHash,
    publicInputs: proofResult.publicInputs,
    proofSizeBytes: proofResult.proofSizeBytes,
    provingTimeMs: proofResult.provingTimeMs,
    scheme: proofResult.scheme,
    bbVersion: proofResult.bbVersion,
  };
}

module.exports = { proveAndAnchor, ValidationError };
