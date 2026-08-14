const express = require("express");
const { proveAndAnchor, ValidationError } = require("./proveService");
const { addressToField } = require("./hash");
const { PORT, PROOF_TYPES, MAX_ALLOWLIST_SIZE } = require("./config");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", proofTypes: Object.keys(PROOF_TYPES), maxAllowlistSize: MAX_ALLOWLIST_SIZE });
});

app.post("/api/address-to-field", (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: "address is required" });
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
      console.error(err);
      res.status(500).json({ error: "proof generation failed", detail: err.message });
    }
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`shieldfund-proof-server listening on :${PORT}`);
  });
}

module.exports = app;
