const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { classifyNotification, verifyNotificationSignature } = require("../midtrans-notification");

test("Midtrans notification signatures validate all signed transaction fields", () => {
  const fields = {
    orderId: "rb_test_123",
    statusCode: "200",
    grossAmount: "10000.00",
    serverKey: "test-server-key"
  };
  const signatureKey = crypto.createHash("sha512")
    .update(`${fields.orderId}${fields.statusCode}${fields.grossAmount}${fields.serverKey}`)
    .digest("hex");

  assert.equal(verifyNotificationSignature({ ...fields, signatureKey }), true);
  assert.equal(verifyNotificationSignature({ ...fields, grossAmount: "10001.00", signatureKey }), false);
  assert.equal(verifyNotificationSignature({ ...fields, signatureKey: "invalid" }), false);
});

test("Midtrans notification states only settle successful payments", () => {
  assert.deepEqual(classifyNotification("settlement"), { settled: true, failed: false, status: "SETTLED" });
  assert.deepEqual(classifyNotification("capture", "accept"), { settled: true, failed: false, status: "SETTLED" });
  assert.deepEqual(classifyNotification("capture", "challenge"), { settled: false, failed: true, status: "FAILED" });
  assert.deepEqual(classifyNotification("expire"), { settled: false, failed: true, status: "EXPIRED" });
  assert.deepEqual(classifyNotification("cancel"), { settled: false, failed: true, status: "CANCELLED" });
  assert.deepEqual(classifyNotification("pending"), { settled: false, failed: false, status: null });
});
