export type Coder = "A" | "B";
export type Status = "pending" | "auto" | "resolved" | "discussion";

export interface DiscussionEntry {
  version: number;
  coder: Coder;
  text: string;
  timestamp: string;
}

export interface Cell {
  cellId: string;
  rowId: string;
  tech: string;
  question: string;
  codesA: string[];
  codesB: string[];
  harmonized: string[] | null;
  status: Status;
  discussion: DiscussionEntry[];
  changedSinceLastVersion: boolean;
  carriedFromVersion: number | null;
}

export interface Codings {
  version: number;
  cells: Cell[];
}

export interface AnswerCell {
  cellId: string;
  tech: string;
  rowId: string;
  question: string;
  answer: string;
}

export interface Answers {
  version: number;
  cells: AnswerCell[];
}

export interface Manifest {
  current: number;
  versions: { n: number; created: string; note: string }[];
}

export interface Labels {
  [code: string]: string;
}

export interface LogEntry {
  timestamp: string;
  coder: Coder;
  cellId: string;
  action:
    | "adopt"
    | "concede"
    | "flag_discussion"
    | "resolved_after_discussion"
    | "unflag_discussion"
    | "add_bilateral";
  code?: string;
  mode: "no_discussion" | "after_discussion";
}

export interface LogFile {
  entries: LogEntry[];
}
