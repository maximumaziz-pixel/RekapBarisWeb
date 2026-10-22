const test = require("node:test");
const assert = require("node:assert/strict");
const { loginAttemptKey } = require("../auth-rate-limit");

test("failed-login buckets are isolated by IP and normalized identifier", () => {
  const emailLogin = loginAttemptKey({ ip: "192.0.2.10", body: { identifier: " User@Example.com " } });
  const normalizedEmailLogin = loginAttemptKey({ ip: "192.0.2.10", body: { identifier: "user@example.com" } });
  const anotherAccount = loginAttemptKey({ ip: "192.0.2.10", body: { identifier: "other@example.com" } });
  const anotherNetwork = loginAttemptKey({ ip: "192.0.2.11", body: { identifier: "user@example.com" } });

  assert.equal(emailLogin, normalizedEmailLogin);
  assert.notEqual(emailLogin, anotherAccount);
  assert.notEqual(emailLogin, anotherNetwork);
  assert.doesNotMatch(emailLogin, /user@example\.com/i);
});

test("malformed login requests receive a bounded fallback bucket key", () => {
  const key = loginAttemptKey({ ip: "192.0.2.10", body: { identifier: "x".repeat(10000) } });

  assert.match(key, /^192\.0\.2\.10:[a-f0-9]{64}$/);
});
