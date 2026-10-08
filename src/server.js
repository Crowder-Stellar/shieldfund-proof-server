const { randomUUID } = require("crypto");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { proveAndAnchor, ValidationError } = require("./proveService");
const { addressToField } = require("./hash");
const { isValidAccountId } = require("./stellar");
const { requireApiKey } = require("./auth");
const { logger } = require("./logger");
const {
  PORT,
  PROOF_TYPES,
  MAX_ALLOWLIST_SIZE,
  PROVE_API_KEYS,
  PROVE_RATE_WINDOW_MS,
  PROVE_RATE_LIMIT_PER_IP,
  PROVE_RATE_LIMIT_PER_KEY,
  TRUST_PROXY_HOPS,
  JSON_BODY_LIMIT,
  SHUTDOWN_TIMEOUT_MS,
} = require("./config");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY_HOPS);

let shuttingDown = false;

// Every response carries an X-Request-Id; 500s return only that id, and the
// full error (stack, raw nargo/bb output, file paths) is logged under it.
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set("X-Request-Id", req.id);
  const started = process.hrtime.bigint();
  // Method, path, status and timing only — never bodies (budget caps, salts).
  res.on("finish", () => {
    logger.info({
      reqId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - started) / 1e6,
      apiKeyId: req.apiKeyId,
    }, "request");
  });
  next();
});

app.use(helmet());

app.use((req, res, next) => {
  if (!shuttingDown) return next();
  res.set("Connection", "close");
  res.status(503).json({ error: "server is shutting down" });
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));

function logInternalError(req, err) {
  logger.error({
    reqId: req.id,
    method: req.method,
    path: req.path,
    err,
    stderr: err && err.stderr,
    stdout: err && err.stdout,
  }, "request failed");
}

const rateLimitOptions = {
  windowMs: PROVE_RATE_WINDOW_MS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too many proof requests, try again later" },
};

// Per-IP runs before auth, so key-guessing is throttled too.
const proveLimitPerIp = rateLimit({ ...rateLimitOptions, limit: PROVE_RATE_LIMIT_PER_IP });
const proveLimitPerKey = rateLimit({
  ...rateLimitOptions,
  limit: PROVE_RATE_LIMIT_PER_KEY,
  keyGenerator: (req) => req.apiKeyId,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", proofTypes: Object.keys(PROOF_TYPES), maxAllowlistSize: MAX_ALLOWLIST_SIZE });
});

app.post("/api/address-to-field", (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: "address is required" });
  if (!isValidAccountId(address)) {
    return res.status(400).json({ error: "address must be a valid Stellar account id (G..., 56 chars)" });
  }
  res.json({ address, recipientId: addressToField(address) });
});

app.post("/api/prove", proveLimitPerIp, requireApiKey(PROVE_API_KEYS), proveLimitPerKey, async (req, res) => {
  const { recipientId, amount, proofType, allowlist, budgetCap, budgetSalt } = req.body || {};
  try {
    const result = await proveAndAnchor({ recipientId, amount, proofType, allowlist, budgetCap, budgetSalt });
    res.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
    } else {
      logInternalError(req, err);
      res.status(500).json({ error: "proof generation failed", requestId: req.id });
    }
  }
});

app.use((err, req, res, _next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: `request body exceeds ${JSON_BODY_LIMIT}`, requestId: req.id });
  }
  // Malformed JSON bodies are the client's fault, not a 500.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON body", requestId: req.id });
  }
  logInternalError(req, err);
  res.status(500).json({ error: "internal error", requestId: req.id });
});

// Stops accepting connections, lets in-flight requests (a proof can take
// tens of seconds) finish, then exits. Forced exit after SHUTDOWN_TIMEOUT_MS.
function shutdown(server, signal, exit = process.exit) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down, waiting for in-flight requests");
  const force = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "shutdown timed out, exiting with requests in flight");
    exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  server.close(() => {
    clearTimeout(force);
    logger.info("shutdown complete");
    exit(0);
  });
  server.closeIdleConnections();
}

function start(port = PORT) {
  if (PROVE_API_KEYS.length === 0) {
    logger.warn("PROVE_API_KEYS is empty: /api/prove will refuse every request");
  }
  const server = app.listen(port, () => {
    logger.info({ port: server.address().port }, "shieldfund-proof-server listening");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => shutdown(server, signal));
  return server;
}

if (require.main === module) start();

module.exports = app;
module.exports.start = start;
module.exports.shutdown = shutdown;
