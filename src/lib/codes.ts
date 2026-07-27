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
};

// Legacy synonym: data coded with SN4/5/6 maps to eSN4/5/6.
const LEGACY_MAP: Record<string, string> = {
  SN4: "eSN4",
  SN5: "eSN5",
  SN6: "eSN6",
};

/** Normalize a code from data to its canonical form. */
export function normalizeCode(code: string): string {
  return LEGACY_MAP[code] ?? code;
}

/** Canonical code list, ordered. */
export const ALL_CODES = Object.keys(CODE_LABELS).filter(
  c => !Object.keys(LEGACY_MAP).includes(c)
);

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
