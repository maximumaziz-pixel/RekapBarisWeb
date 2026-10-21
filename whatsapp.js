const FONNTE_SEND_URL = "https://api.fonnte.com/send";

function getFonnteConfig(env = process.env) {
  const token = env.FONNTE_TOKEN?.trim();
  return token ? { token } : null;
}

function buildResetMessage(name, resetUrl) {
  const safeName = name.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim();
  return `Halo ${safeName}, gunakan tautan ini untuk mengatur ulang password Rekap Baris:\n${resetUrl}\n\nTautan berlaku selama 60 menit. Jika Anda tidak meminta reset password, abaikan pesan ini.`;
}

async function sendPasswordResetWhatsApp({ phone, name, resetUrl }) {
  const config = getFonnteConfig();
  if (!config) throw new Error("Fonnte API is not configured.");

  const body = new FormData();
  body.set("target", phone);
  body.set("message", buildResetMessage(name, resetUrl));
  body.set("countryCode", "0");
  body.set("preview", "false");

  const response = await fetch(FONNTE_SEND_URL, {
    method: "POST",
    headers: { Authorization: config.token },
    body,
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Fonnte API returned HTTP ${response.status}.`);

  const result = await response.json();
  if (result.status !== true) throw new Error("Fonnte did not accept the password reset message.");
}

module.exports = { buildResetMessage, getFonnteConfig, sendPasswordResetWhatsApp };
