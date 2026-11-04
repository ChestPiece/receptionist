// UAE mobile numbers as WhatsApp digits ("971501234567"), from what a person types at the desk.
export function normUaePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "").replace(/^00/, "");
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
