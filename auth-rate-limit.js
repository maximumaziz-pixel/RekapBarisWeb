const crypto = require("node:crypto");

// Keep separate accounts from consuming one another's failed-login allowance on shared networks.
function loginAttemptKey(req) {
  const identifier = typeof req.body?.identifier === "string"
    ? req.body.identifier.trim().toLowerCase().slice(0, 254)
    : "";
  const identifierHash = crypto.createHash("sha256").update(identifier).digest("hex");
  return `${req.ip || "unknown"}:${identifierHash}`;
}

module.exports = { loginAttemptKey };
