const pino = require("pino");
const { LOG_LEVEL } = require("./config");

// Budget caps and salts are the secrets behind the public budget_commitment;
// they must never reach the logs. Nothing logs request bodies today — this is
// the backstop if someone adds that later.
const REDACT_PATHS = [
  "budgetCap",
  "budgetSalt",
  "*.budgetCap",
  "*.budgetSalt",
  "*.*.budgetCap",
  "*.*.budgetSalt",
  "req.headers['x-api-key']",
  "req.headers.authorization",
];

function createLogger(destination, level = LOG_LEVEL) {
  return pino(
    {
      level,
      base: { service: "shieldfund-proof-server" },
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    },
    destination,
  );
}

const logger = createLogger();

module.exports = { logger, createLogger };
