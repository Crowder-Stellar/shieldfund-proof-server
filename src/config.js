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

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return n;
}

// Comma-separated API keys accepted on /api/prove (X-API-Key header). Empty
// means the endpoint refuses every request — it never runs unauthenticated.
const PROVE_API_KEYS = (process.env.PROVE_API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

// Proof requests allowed per window, per client IP and per API key.
const PROVE_RATE_WINDOW_MS = intEnv("PROVE_RATE_WINDOW_MS", 15 * 60 * 1000);
const PROVE_RATE_LIMIT_PER_IP = intEnv("PROVE_RATE_LIMIT_PER_IP", 10);
const PROVE_RATE_LIMIT_PER_KEY = intEnv("PROVE_RATE_LIMIT_PER_KEY", 30);

// Number of reverse-proxy hops in front of the server (Render, nginx, ...),
// so per-IP limits see the real client address. 0 = directly exposed.
const TRUST_PROXY_HOPS = intEnv("TRUST_PROXY_HOPS", 0);

const JSON_BODY_LIMIT = "32kb";

// A single nargo/bb invocation is killed after this long, so a hung process
// can't hold a circuit mutex forever.
const SUBPROCESS_TIMEOUT_MS = intEnv("SUBPROCESS_TIMEOUT_MS", 120 * 1000);

// On SIGTERM/SIGINT, how long in-flight proofs get to finish before exit.
const SHUTDOWN_TIMEOUT_MS = intEnv("SHUTDOWN_TIMEOUT_MS", 60 * 1000);

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

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
  PROVE_API_KEYS,
  PROVE_RATE_WINDOW_MS,
  PROVE_RATE_LIMIT_PER_IP,
  PROVE_RATE_LIMIT_PER_KEY,
  TRUST_PROXY_HOPS,
  JSON_BODY_LIMIT,
  SUBPROCESS_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS,
  LOG_LEVEL,
};
