const { createHash, timingSafeEqual } = require("crypto");

const digest = (value) => createHash("sha256").update(value).digest();

// Requires a valid X-API-Key header. Keys are compared as SHA-256 digests with
// timingSafeEqual, so neither the comparison time nor the key length leaks.
// Sets req.apiKeyId (a short digest prefix, safe to log and to rate-limit on).
function requireApiKey(apiKeys) {
  const keyDigests = apiKeys.map(digest);
  return (req, res, next) => {
    if (keyDigests.length === 0) {
      return res.status(503).json({ error: "proving is disabled: no API keys configured", requestId: req.id });
    }
    const presented = req.get("x-api-key");
    if (!presented) return res.status(401).json({ error: "missing X-API-Key header" });
    const presentedDigest = digest(presented);
    // Check every key (no early exit) so timing doesn't reveal which matched.
    let ok = false;
    for (const d of keyDigests) ok = timingSafeEqual(d, presentedDigest) || ok;
    if (!ok) return res.status(401).json({ error: "invalid API key" });
    req.apiKeyId = presentedDigest.toString("hex").slice(0, 16);
    next();
  };
}

module.exports = { requireApiKey };
