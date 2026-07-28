// Codebook: canonical codes, their labels, and family grouping.

export const CODE_LABELS: Record<string, string> = {
  // Attitude
  A1:   "Klimanutzen & Verantwortung",
  A2:   "Unabhängigkeit von Fossilen",
  A3:   "Autarkie",
  A4:   "Wirtschaftlichkeit/TCO",
  A6:   "Lärm/Optik-Sorgen",
  A7:   "Regelstabilität/Vertrauen",
  A8:   "Traditionsenergie",
  A9:   "FW-Preistransparenz",
  A51:  "Komfort",
  A52:  "Zuverlässigkeit",
  eA10: "Technikinteresse/Leidenschaft",
  eA11: "Bereitschaft/Offenheit/Motivation",
  eA12: "Zukunftsperspektive",
  eA13: "Status",

  // Perceived Behavioural Control
  PBC1:  "Technische Passfähigkeit",
  PBC2:  "Handwerker-Kapazität",
  PBC3:  "Lieferzeiten & Teile",
  PBC4:  "Finanzierung/Vorfinanzierung",
  PBC5:  "Budgetdruck/Strompreis-Sorge",
  PBC6:  "Förderung/70%-Kombi",
  PBC7:  "Antragslast/Prozess",
  PBC8:  "PV-Kopplung/Autarkie",
  PBC9:  "Usability/Einweisung",
  PBC10: "Platz/Lager",
  PBC11: "Notfallersatz/Timing",
  PBC12: "One-Stop-Shop/Kommunale Lotsen",
  PBC13: "FW-Komfort",
  ePBC14: "(Un-)Wissen",
  ePBC15: "Zwang/Bevormundung",
  ePBC16: "Installations-/Wartungsaufwand",

  // Subjective Norms
  SN1:  "Installateur-Empfehlung",
  SN2:  "Peer-Erfahrungen",
  SN3:  "Kommunale Signale/Wärmeplanung",
  eSN4: "Familie",
  eSN5: "Energieberater",
  eSN6: "Medien",
  eSN7: "Ehepartner:in",
  eSN8: "neutrale Institution",
};

// Legacy synonyms: SN4/5/6 typed in the coding dropdown map to eSN4/5/6.
const LEGACY_MAP: Record<string, string> = {
  SN4: "eSN4",
  SN5: "eSN5",
  SN6: "eSN6",
  SN7: "eSN7",
  SN8: "eSN8",
};

// Case-insensitive lookup: any casing (EPBC14, epbc14, ePBC14) resolves
// to canonical form. Case-insensitive legacy mapping also works
// (SN4 == sn4 == Sn4 -> eSN4).
const CANONICAL_BY_UPPER: Record<string, string> = {};
for (const c of Object.keys(CODE_LABELS)) CANONICAL_BY_UPPER[c.toUpperCase()] = c;
for (const [k, v] of Object.entries(LEGACY_MAP)) CANONICAL_BY_UPPER[k.toUpperCase()] = v;

/** Normalize a code from data to its canonical form (fixes casing + legacy names). */
export function normalizeCode(code: string): string {
  if (!code) return code;
  return CANONICAL_BY_UPPER[code.toUpperCase()] ?? code;
}

/** Canonical code list. */
export const ALL_CODES = Object.keys(CODE_LABELS);

export function labelOf(code: string): string {
  return CODE_LABELS[code] ?? CODE_LABELS[normalizeCode(code)] ?? "";
}

export function isKnownCode(code: string): boolean {
  const norm = normalizeCode(code);
  return Object.prototype.hasOwnProperty.call(CODE_LABELS, norm);
}

/** Family grouping for the frequency page. */
export function familyOf(code: string): "A" | "PBC" | "SN" | "other" {
  const c = normalizeCode(code);
  if (/^e?A\d+$/i.test(c)) return "A";
  if (/^e?PBC\d+$/i.test(c)) return "PBC";
  if (/^e?SN\d+$/i.test(c)) return "SN";
  return "other";
}

/** Sort key for stable ordering within a family. */
export function codeSortKey(code: string): [string, number] {
  const c = normalizeCode(code);
  const m = c.match(/^(e?)(A|PBC|SN)(\d+)$/i);
  if (!m) return ["z", 999];
  return [m[1] + m[2], parseInt(m[3], 10)];
}
