// Two real-data quirks in Bahrain MOE PDF/Excel exports, shared across every
// place that needs to compare or key on extracted Arabic text:
//
// 1. Invisible bidi control marks (LRM/RLM/LRE-PDF) that PDF text extraction
//    sometimes leaves embedded around Arabic/Latin run boundaries — visually
//    invisible, but they break exact-string equality (Map lookups, header
//    matching) even when two values look identical on screen.
// 2. Arabic-Indic digits (٠-٩) used in some columns/PDF cells where other
//    columns/tables use plain ASCII digits (0-9) for the exact same number.
const BIDI_MARKS = /[‎‏‪-‮]/g;
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function stripBidiMarks(text) {
  return String(text ?? "").replace(BIDI_MARKS, "");
}

export function normalizeArabicIndicDigits(text) {
  return String(text ?? "").replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)));
}

// Applies both normalizations plus a trim — the standard shape for any value
// used as a lookup key (subject codes, header cells) or for chronological/
// exact matching.
export function normalizeKey(text) {
  return normalizeArabicIndicDigits(stripBidiMarks(String(text ?? ""))).trim();
}
