// The canonical code list, and prefix-family grouping.
export const ALL_CODES = [
  ...Array.from({ length: 13 }, (_, i) => `PBC${i + 1}`),
  ...Array.from({ length: 3 }, (_, i) => `ePBC${i + 14}`),
  ...Array.from({ length: 9 }, (_, i) => `A${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `eA${i + 10}`),
  ...Array.from({ length: 2 }, (_, i) => `A${i + 51}`),
  ...Array.from({ length: 6 }, (_, i) => `SN${i + 1}`),
];

// Which "family group" a code belongs to on the frequency page.
// A and eA are grouped together, PBC and ePBC together, SN alone.
export function familyOf(code: string): "A" | "PBC" | "SN" | "other" {
  if (/^e?A\d+$/i.test(code)) return "A";
  if (/^e?PBC\d+$/i.test(code)) return "PBC";
  if (/^SN\d+$/i.test(code)) return "SN";
  return "other";
}

export function isKnownCode(code: string): boolean {
  return ALL_CODES.includes(code);
}
