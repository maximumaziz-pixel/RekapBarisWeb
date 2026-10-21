const crypto = require("node:crypto");

function isStrongPassword(password) {
  return typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password);
}

function deriveKey(password, salt, keyLength) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, (error, key) => error ? reject(error) : resolve(key));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await deriveKey(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, saltValue, hashValue] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, "base64url");
  const expectedKey = Buffer.from(hashValue, "base64url");
  if (salt.length !== 16 || expectedKey.length !== 64) return false;
  const derivedKey = await deriveKey(password, salt, expectedKey.length);
  return crypto.timingSafeEqual(derivedKey, expectedKey);
}

module.exports = { hashPassword, isStrongPassword, verifyPassword };
