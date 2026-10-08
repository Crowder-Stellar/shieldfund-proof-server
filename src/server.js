const { randomUUID } = require("crypto");
const express = require("express");
const { proveAndAnchor, ValidationError } = require("./proveService");
const { addressToField } = require("./hash");
const { isValidAccountId } = require("./stellar");
const { PORT, PROOF_TYPES, MAX_ALLOWLIST_SIZE } = require("./config");

const app = express();

// Every response carries an X-Request-Id; 500s return only that id, and the
// full error (stack, raw nargo/bb output, file paths) is logged under it.
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set("X-Request-Id", req.id);
  next();
});

app.use(express.json());

function logInternalError(req, err) {
  console.error(`[${req.id}] ${req.method} ${req.path} failed:`, err);
  if (err && (err.stderr || err.stdout)) {
    console.error(`[${req.id}] stderr:\n${err.stderr || ""}\n[${req.id}] stdout:\n${err.stdout || ""}`);
  }
}

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

app.post("/api/prove", async (req, res) => {
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
  // Malformed / oversized JSON bodies are the client's fault, not a 500.
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(err.status || 400).json({ error: "invalid JSON body", requestId: req.id });
  }
  logInternalError(req, err);
  res.status(500).json({ error: "internal error", requestId: req.id });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`shieldfund-proof-server listening on :${PORT}`);
  });
}

module.exports = app;
