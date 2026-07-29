import type {
  Answers,
  Codings,
  Coder,
  LogEntry,
  LogFile,
  Labels,
  Manifest,
} from "./types";

// Raw JSON is fetched from the repo. In dev this is served from /data/*
// (Vite's public dir maps to root). In prod on Netlify, the data/ folder
// is committed to the repo and served as static files.

const DATA_BASE = "/data";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadManifest(): Promise<Manifest> {
  return getJSON<Manifest>("manifest.json");
}

export async function loadVersion(n: number): Promise<{
  answers: Answers;
  codings: Codings;
}> {
  const [answers, codings] = await Promise.all([
    getJSON<Answers>(`v${n}/answers.json`),
    getJSON<Codings>(`v${n}/codings.json`),
  ]);
  return { answers, codings };
}

export async function loadLabels(): Promise<Labels> {
  try {
    return await getJSON<Labels>("labels.json");
  } catch {
    return {};
  }
}

export async function loadLog(): Promise<LogFile> {
  try {
    return await getJSON<LogFile>("log.json");
  } catch {
    return { entries: [] };
  }
}

// --- Commit via Netlify Function --------------------------------------------

const PW_KEY = "harm_password";
const CODER_KEY = "harm_coder";

export function getPassword(): string {
  return localStorage.getItem(PW_KEY) || "";
}
export function setPassword(pw: string) {
  localStorage.setItem(PW_KEY, pw);
}
export function getCoder(): Coder | null {
  const v = localStorage.getItem(CODER_KEY);
  return v === "A" || v === "B" ? v : null;
}
export function setCoder(c: Coder) {
  localStorage.setItem(CODER_KEY, c);
}

export async function commit(
  path: string,
  content: unknown,
  message: string
): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
  const coder = getCoder();
  const password = getPassword();
  if (!coder) return { ok: false, error: "No coder selected" };
  // Password is required for the Netlify function (production).
  // In dev mode the local dev-server.mjs ignores it, so allow blank.
  if (!password && !import.meta.env.DEV) return { ok: false, error: "No password set" };

  const res = await fetch("/api/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, message, coder, password: password || "dev" }),
  });
  if (res.ok) return { ok: true };
  if (res.status === 409) return { ok: false, error: "conflict", conflict: true };
  const text = await res.text();
  return { ok: false, error: `${res.status}: ${text}` };
}

// --- Log ---------------------------------------------------------------------

export function makeLogEntry(
  coder: Coder,
  cellId: string,
  action: LogEntry["action"],
  mode: LogEntry["mode"],
  code?: string
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    coder,
    cellId,
    action,
    code,
    mode,
  };
}
