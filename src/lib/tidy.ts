import { splitChips } from "./chips";

// WhatsApp-safe punctuation: no en/em dashes (they read as machine-written). Hyphens in words stay.
export const tidy = (text: string) =>
  splitChips(text).text // a web-only chips marker must never reach WhatsApp
    .replace(/(\d(?:\s?[ap]m)?)\s*[–—]\s*(?=\d)/gi, "$1 to ")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/ +- +/g, ", ");
