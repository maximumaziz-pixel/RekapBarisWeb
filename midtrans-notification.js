const crypto = require("node:crypto");

function verifyNotificationSignature({ orderId, statusCode, grossAmount, signatureKey, serverKey }) {
  if (!serverKey || typeof signatureKey !== "string" || !/^[a-f\d]{128}$/i.test(signatureKey)) return false;
  const expected = crypto.createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
  const providedBuffer = Buffer.from(signatureKey.toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function classifyNotification(transactionStatus, fraudStatus) {
  if (transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus !== "challenge")) {
    return { settled: true, failed: false, status: "SETTLED" };
  }
  if (["deny", "cancel", "expire"].includes(transactionStatus) ||
      (transactionStatus === "capture" && fraudStatus === "challenge")) {
    return {
      settled: false,
      failed: true,
      status: transactionStatus === "expire" ? "EXPIRED" : transactionStatus === "cancel" ? "CANCELLED" : "FAILED"
    };
  }
  return { settled: false, failed: false, status: null };
}

module.exports = { classifyNotification, verifyNotificationSignature };
