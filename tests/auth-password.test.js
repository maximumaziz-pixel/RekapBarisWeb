const test = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, isStrongPassword, verifyPassword } = require("../auth-password");

test("password hashes verify only the original password", async () => {
  const password = "a long test password";
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.match(passwordHash, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword("wrong password", passwordHash), false);
});

test("malformed password hashes are rejected", async () => {
  assert.equal(await verifyPassword("password", "invalid"), false);
  assert.equal(await verifyPassword("password", "scrypt$bad$bad"), false);
});

test("password policy requires letters, numbers, symbols, and at least eight characters", () => {
  assert.equal(isStrongPassword("StrongPass1!"), true);
  assert.equal(isStrongPassword("short1!"), false);
  assert.equal(isStrongPassword("lettersOnly!"), false);
  assert.equal(isStrongPassword("12345678!"), false);
  assert.equal(isStrongPassword("Letters123"), false);
  assert.equal(isStrongPassword("Letters123 "), false);
  assert.equal(isStrongPassword("A".repeat(129) + "1!"), false);
});
