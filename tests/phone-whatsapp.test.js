const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, phoneLookupCandidates, whatsappRecipient } = require("../phone");
const { buildResetMessage, getFonnteConfig } = require("../whatsapp");

test("phone normalization preserves registered format and maps local Indonesian numbers for WhatsApp", () => {
  assert.equal(normalizePhone("+62 812-3456-7890"), "+6281234567890");
  assert.ok(phoneLookupCandidates("+62 812-3456-7890").includes("081234567890"));
  assert.ok(phoneLookupCandidates("0812 3456 7890").includes("+6281234567890"));
  assert.equal(whatsappRecipient("0812 3456 7890"), "6281234567890");
  assert.equal(whatsappRecipient("+62 812-3456-7890"), "6281234567890");
  assert.equal(whatsappRecipient("invalid"), null);
});

test("reset message contains expiry, reset link, and safe single-line display name", () => {
  const message = buildResetMessage("Nama\nPalsu", "https://rekapbaris.com/?resetToken=test-token");
  assert.match(message, /^Halo Nama Palsu,/);
  assert.match(message, /https:\/\/rekapbaris\.com\/\?resetToken=test-token/);
  assert.match(message, /60 menit/);
});

test("Fonnte is disabled until a server-side API token is configured", () => {
  assert.equal(getFonnteConfig({}), null);
  assert.deepEqual(getFonnteConfig({ FONNTE_TOKEN: " token " }), { token: "token" });
});

test("reset message is submitted to Fonnte with token authorization and international target", async (t) => {
  const originalToken = process.env.FONNTE_TOKEN;
  process.env.FONNTE_TOKEN = "test-fonnte-token";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: true, id: ["message-id"] })
  }));
  try {
    const { sendPasswordResetWhatsApp } = require("../whatsapp");
    await sendPasswordResetWhatsApp({
      phone: "6281234567890",
      name: "Nama",
      resetUrl: "https://rekapbaris.com/?resetToken=random-token"
    });
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(fetchMock.mock.calls[0].arguments[0], "https://api.fonnte.com/send");
    const options = fetchMock.mock.calls[0].arguments[1];
    assert.equal(options.headers.Authorization, "test-fonnte-token");
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get("target"), "6281234567890");
    assert.equal(options.body.get("countryCode"), "0");
    assert.match(options.body.get("message"), /random-token/);
  } finally {
    if (originalToken === undefined) delete process.env.FONNTE_TOKEN;
    else process.env.FONNTE_TOKEN = originalToken;
  }
});

test("Fonnte application-level failures are not treated as successful delivery", async (t) => {
  const originalToken = process.env.FONNTE_TOKEN;
  process.env.FONNTE_TOKEN = "test-fonnte-token";
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: false, reason: "device disconnected" })
  }));
  try {
    const { sendPasswordResetWhatsApp } = require("../whatsapp");
    await assert.rejects(
      sendPasswordResetWhatsApp({ phone: "6281234567890", name: "Nama", resetUrl: "https://example.com/reset" }),
      /Fonnte did not accept/
    );
  } finally {
    if (originalToken === undefined) delete process.env.FONNTE_TOKEN;
    else process.env.FONNTE_TOKEN = originalToken;
  }
});
