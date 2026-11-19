// UAE mobile numbers as WhatsApp digits ("971501234567"), from what a person types at the desk.
// Arabic-Indic (U+0660) and Persian (U+06F0) digits become ASCII first: JS \d matches ASCII only.
export const asciiDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 0xf));

export function normUaePhone(raw: string): string | null {
  const d = asciiDigits(raw).replace(/\D/g, "").replace(/^00/, "");
  const local = d.startsWith("971") ? d.slice(3) : d.replace(/^0/, "");
  return /^5\d{8}$/.test(local) ? `971${local}` : null;
}

export const waIdOf = (digits: string) => `${digits}@c.us`;

// The number staff dial or open in WhatsApp, as digits with country code ("971501234567"), or null.
// A typed phone wins over the WhatsApp id; a foreign number is kept as its digits.
export function contactDigits(phone: string | null, waId: string | null): string | null {
  const typed = phone ? normUaePhone(phone) ?? phone.replace(/\D/g, "").replace(/^00/, "") : "";
  const d = typed || (waId ?? "").replace(/@.*/, "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}
