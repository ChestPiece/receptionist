// Life-threatening signs get a fixed reply before the model runs, so this never depends on the LLM.
// Narrow on purpose: an ordinary toothache must still flow into booking.
const EMERGENCY = new RegExp(
  [
    "(can'?t|can ?not|unable to) (breathe|swallow)|(difficulty|trouble|hard to|struggling to) (breath|swallow)|not breathing|choking",
    "unconscious|fainted",
    "(won'?t|not|doesn'?t) stop bleeding|bleeding (won'?t|will not|doesn'?t|does not) stop|(severe|heavy|heavily|serious) bleeding|bleeding (a lot|heavily|badly)",
    "swelling (near|to|in|around) (my |the )?(eye|neck|throat)|(face|jaw|neck) (is )?swell|(face|jaw|neck) swelling",
    // Accident now, not "an accident last year".
    "accident(?![^.?!]*\\b(last|ago|years?|months?)\\b)",
    // Arabizi (Gulf/Levant chat spelling)
    "(ma|mo|mu) (a2dar|agdar|gader|qader|a2der) (atnafas|etnafas|abla3|ebla3)|(el|al)? ?dam (ma|mo) (wa2af|waqaf|yew2af|yoqaf)",
    "لا (أستطيع|استطيع) (التنفس|البلع)|ما (اقدر|أقدر) (اتنفس|أتنفس|ابلع|أبلع)|فاقد الوعي|إغماء|اغماء|(النزيف|الدم) (لا|ما) ?(يتوقف|وقف|يوقف)|حادث",
  ].join("|"),
  "i",
);

// Phones type curly apostrophes (can’t); fold them so the patterns above match.
export const isEmergency = (text: string) => EMERGENCY.test(text.replace(/[’‘`´]/g, "'"));

// Patient text must never pass as a staff marker or a transcribed note: those tags carry authority in the prompt.
export const unforge = (text: string) => text.replace(/^\s*(\[(front desk|voice note)\]\s*:?\s*)+/i, "");

// Post-login redirect: same-site paths only. Browsers treat "/\x" like "//x" (another host).
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/dashboard");

export const emergencyReply = (text: string, clinicPhone: string | null) =>
  /[؀-ۿ]/.test(text)
    ? `إذا كانت حالة طارئة، اتصل بالإسعاف على 998 فوراً أو توجه إلى أقرب قسم طوارئ.${clinicPhone ? ` هاتف العيادة: ${clinicPhone}` : ""}`
    : `If this is an emergency, call 998 (ambulance) now or go to the nearest emergency department.${clinicPhone ? ` Clinic phone: ${clinicPhone}` : ""}`;

// Opt-out from follow-up, recall and waitlist messages. Whole message only. Not "الغاء": in Arabic that means "cancel" (an appointment).
export const isStop = (text: string) => /^\s*(stop|unsubscribe|توقف|إيقاف|ايقاف)\s*[.!]?\s*$/i.test(text);

export const stopReply =
  "Done, you won't get follow-up messages from us. Reminders for booked visits still come, and you can message here any time.\nتم، لن نرسل لك رسائل متابعة. ستصلك تذكيرات المواعيد المحجوزة فقط، ويمكنك مراسلتنا هنا في أي وقت.";
