// Question labels per Q number. Each tech has its own numbering but the
// six conceptual questions per tech share the same order:
//   1: Attitude positive
//   2: Attitude negative
//   3: Social Norm
//   4: PBC Erleichterung
//   5: PBC Erschwernis
//   6: Gefühle & Empfindungen
// wärmepumpe:  Q15..Q20
// fernwärme:   Q21..Q26
// biomass:     Q27..Q32
// konventionelle: Q33..Q38

export const QUESTION_LABELS: Record<string, string> = {
  Q15: "Attitude positive", Q16: "Attitude negative", Q17: "Social Norm",
  Q18: "PBC Erleichterung", Q19: "PBC Erschwernis", Q20: "Gefühle & Empfindungen",

  Q21: "Attitude positive", Q22: "Attitude negative", Q23: "Social Norm",
  Q24: "PBC Erleichterung", Q25: "PBC Erschwernis", Q26: "Gefühle & Empfindungen",

  Q27: "Attitude positive", Q28: "Attitude negative", Q29: "Social Norm",
  Q30: "PBC Erleichterung", Q31: "PBC Erschwernis", Q32: "Gefühle & Empfindungen",

  Q33: "Attitude positive", Q34: "Attitude negative", Q35: "Social Norm",
  Q36: "PBC Erleichterung", Q37: "PBC Erschwernis", Q38: "Gefühle & Empfindungen",
};

export function labelOfQuestion(q: string): string {
  return QUESTION_LABELS[q] ?? "";
}
