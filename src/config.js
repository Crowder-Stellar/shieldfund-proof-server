const path = require("path");
const os = require("os");

const NARGO_BIN = process.env.NARGO_BIN || path.join(os.homedir(), ".nargo", "bin", "nargo");
const BB_BIN = process.env.BB_BIN || path.join(os.homedir(), ".bb", "bb");

const CIRCUITS_DIR = path.join(__dirname, "..", "circuits");
const HASH_UTIL_DIR = path.join(CIRCUITS_DIR, "hash_util");
const PAYROLL_DIR = path.join(CIRCUITS_DIR, "payroll_compliance");

// Must match `global DEPTH` in circuits/payroll_compliance/src/main.nr.
const MERKLE_DEPTH = 4;
const MAX_ALLOWLIST_SIZE = 2 ** MERKLE_DEPTH;

// Must match circuits/payroll_compliance's proof_type_id encoding, and the
// proof_type Symbol values ("payroll" | "operational" | "relief") that
// shieldfund-contracts' proof_registry stores.
const PROOF_TYPES = { payroll: 0, operational: 1, relief: 2 };

const PORT = process.env.PORT || 4100;

module.exports = {
  NARGO_BIN,
  BB_BIN,
  CIRCUITS_DIR,
  HASH_UTIL_DIR,
  PAYROLL_DIR,
  MERKLE_DEPTH,
  MAX_ALLOWLIST_SIZE,
  PROOF_TYPES,
  PORT,
};
