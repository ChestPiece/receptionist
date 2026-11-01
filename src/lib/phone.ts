// UAE mobile numbers as WhatsApp digits ("971501234567"), from what a person types at the desk.
export function normUaePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "").replace(/^00/, "");
  const local = d.startsWith("971") ? d.slice(3) : d.replace(/^0/, "");
  return /^5\d{8}$/.test(local) ? `971${local}` : null;
}

export const waIdOf = (digits: string) => `${digits}@c.us`;
