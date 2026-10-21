function normalizePhone(value) {
  if (typeof value !== "string" || !/^[+\d\s().-]+$/.test(value)) return null;
  const normalized = value.replace(/[^\d+]/g, "");
  return /^\+?\d{8,15}$/.test(normalized) ? normalized : null;
}

function phoneLookupCandidates(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  const digits = normalized.replace(/\D/g, "");
  const candidates = new Set([normalized, digits, `+${digits}`]);
  if (digits.startsWith("0")) {
    candidates.add(`+62${digits.slice(1)}`);
    candidates.add(`62${digits.slice(1)}`);
  } else if (digits.startsWith("62")) {
    candidates.add(`0${digits.slice(2)}`);
  } else if (normalized.startsWith("+62")) {
    candidates.add(`0${digits.slice(2)}`);
  }
  return [...candidates];
}

function whatsappRecipient(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  const international = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return /^\d{8,15}$/.test(international) ? international : null;
}

module.exports = { normalizePhone, phoneLookupCandidates, whatsappRecipient };
