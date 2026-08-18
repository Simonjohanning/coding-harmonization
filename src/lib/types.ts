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
  versions: {
    n: number;
    created: string;
    note: string;
    subcodings?: Record<string, { minorVersion: number; created: string; completedAt: string | null }>;
  }[];
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
    | "add_bilateral"
    | "retract_bilateral"
    | "create_subcoding"
    | "create_subcode"
    | "edit_subcode_label"
    | "delete_subcode"
    | "subcode_adopt"
    | "subcode_concede"
    | "subcode_add_bilateral"
    | "subcode_flag_discussion"
    | "subcode_unflag_discussion"
    | "finalize_subcoding_cell";
  code?: string;
  parent?: string;
  mode: "no_discussion" | "after_discussion";
}

export interface LogFile {
  entries: LogEntry[];
}

// ---- Subcoding ----

export interface Subcode {
  id: string;                    // e.g. "PBC61"
  label: string;                 // e.g. "Förderung"
  createdAt: string;
  createdBy: Coder;
}

export interface SubcodingCell {
  cellId: string;
  rowId: string;
  tech: string;
  question: string;
  codesA: string[];              // subcode ids picked by Coder A
  codesB: string[];              // subcode ids picked by Coder B
  harmonized: string[] | null;   // subcodes agreed
  status: Status;
  discussion: DiscussionEntry[];
}

export interface Subcoding {
  version: number;               // parent (major) version
  minorVersion: number;          // subversion index within the parent
  parent: string;                // parent code being subcoded, e.g. "PBC6"
  subcodes: Subcode[];
  cells: SubcodingCell[];
  createdAt: string;
  completedAt: string | null;
}

export interface SubcodingRegistry {
  version: number;
  entries: { parent: string; minorVersion: number; completedAt: string | null }[];
}
