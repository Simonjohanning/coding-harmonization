import { useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Codings, Coder, DiscussionEntry, LogFile } from "../lib/types";
import { commit, loadLog, loadVersion, makeLogEntry } from "../lib/data";
import { normalizeCode } from "../lib/codes";
import DiscrepancyCard from "../components/DiscrepancyCard";

interface Props {
  version: number;
  coder: Coder;
  isCurrent: boolean;
}

type StatusFilter = "all" | "pending" | "discussion" | "resolved" | "auto";
type SortMode = "ingest" | "recent" | "flagged";

// Local per-cell record of a write we made, so we can distinguish
// "CDN is stale" (poll returns pre-write state) from "other coder changed
// it" (poll returns a version that's neither pre- nor post-write).
interface WriteWatch {
  preWrite: Cell;
  postWrite: Cell;
  createdAt: number;
}

// Compare two Cell records for content equality on the fields
// we care about for sync.
function cellsEqual(a: Cell, b: Cell): boolean {
  if (a.status !== b.status) return false;
  if (!arraysEqual(a.codesA, b.codesA)) return false;
  if (!arraysEqual(a.codesB, b.codesB)) return false;
  if (!arraysEqual(a.harmonized || [], b.harmonized || [])) return false;
  if (a.discussion.length !== b.discussion.length) return false;
  for (let i = 0; i < a.discussion.length; i++) {
    const x = a.discussion[i], y = b.discussion[i];
    if (x.text !== y.text || x.timestamp !== y.timestamp || x.coder !== y.coder) return false;
  }
  return true;
}
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Summarize what changed between pre and post to show on a conflict banner
function describeWrite(pre: Cell, post: Cell): string {
  const parts: string[] = [];
  if (pre.status !== post.status) parts.push(`status ${pre.status} → ${post.status}`);
  const addedA = post.codesA.filter(c => !pre.codesA.includes(c));
  const removedA = pre.codesA.filter(c => !post.codesA.includes(c));
  const addedB = post.codesB.filter(c => !pre.codesB.includes(c));
  const removedB = pre.codesB.filter(c => !post.codesB.includes(c));
  if (addedA.length) parts.push(`A +${addedA.join(",")}`);
  if (removedA.length) parts.push(`A −${removedA.join(",")}`);
  if (addedB.length) parts.push(`B +${addedB.join(",")}`);
  if (removedB.length) parts.push(`B −${removedB.join(",")}`);
  if (post.discussion.length > pre.discussion.length) {
    parts.push(`+${post.discussion.length - pre.discussion.length} comment(s)`);
  }
  return parts.join(", ") || "no visible change";
}

export default function Reconcile({ version, coder, isCurrent }: Props) {
  const [codings, setCodings] = useState<Codings | null>(null);
  const [answersById, setAnswersById] = useState<Record<string, string>>({});
  const [log, setLog] = useState<LogFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tech, setTech] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [changedOnly, setChangedOnly] = useState(false);
  const [bothCodedOnly, setBothCodedOnly] = useState(true);
  const [sort, setSort] = useState<SortMode>("ingest");

  const [focusIdx, setFocusIdx] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Per-cell watch after a write — populated on success, consumed by poll.
  const watchesRef = useRef<Map<string, WriteWatch>>(new Map());

  // Conflict flags (banner shown until dismissed). Keyed by cellId.
  const [conflicts, setConflicts] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const { answers, codings } = await loadVersion(version);
      const norm: Codings = normalizeCodings(codings);
      setCodings(norm);
      const map: Record<string, string> = {};
      for (const a of answers.cells) map[a.cellId] = a.answer;
      setAnswersById(map);
      setLog(await loadLog());
    })();
  }, [version]);

  // Poll for remote changes every 30s.
  const savingRef = useRef(false);
  useEffect(() => { savingRef.current = saving; }, [saving]);
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if (savingRef.current) return;
      try {
        const { codings: fresh } = await loadVersion(version);
        const now = Date.now();
        const watchMap = watchesRef.current;

        const reconciled: Cell[] = fresh.cells.map(remoteCellRaw => {
          const remoteCell = normalizeCell(remoteCellRaw);
          const w = watchMap.get(remoteCell.cellId);
          if (!w) return remoteCell;

          // Expire watches after 5 minutes regardless.
          if (now - w.createdAt > 5 * 60 * 1000) {
            watchMap.delete(remoteCell.cellId);
            return remoteCell;
          }

          if (cellsEqual(remoteCell, w.postWrite)) {
            // CDN caught up with my write. Stop watching.
            watchMap.delete(remoteCell.cellId);
            return remoteCell;
          }
          if (cellsEqual(remoteCell, w.preWrite)) {
            // CDN still serving pre-write state. Keep my local state,
            // keep watching so a later poll can confirm.
            return w.postWrite;
          }
          // Diverged: other coder wrote after me. Accept remote,
          // flag for the coder to review.
          watchMap.delete(remoteCell.cellId);
          const summary = describeWrite(w.preWrite, w.postWrite);
          setConflicts(prev => {
            const next = new Map(prev);
            next.set(remoteCell.cellId, `your write (${summary}) was overwritten by the other coder`);
            return next;
          });
          return remoteCell;
        });

        setCodings({ ...fresh, cells: reconciled });
        try { setLog(await loadLog()); } catch { /* ignore */ }
      } catch {
        // ignore transient errors
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [version]);

  const techs = useMemo(() => {
    if (!codings) return [];
    return Array.from(new Set(codings.cells.map(c => c.tech))).sort();
  }, [codings]);

  const firstFlaggedAt = useMemo(() => {
    const m = new Map<string, string>();
    if (!log) return m;
    for (const e of log.entries) {
      if (e.action !== "flag_discussion") continue;
      const cur = m.get(e.cellId);
      if (!cur || e.timestamp < cur) m.set(e.cellId, e.timestamp);
    }
    return m;
  }, [log]);

  function lastActivity(c: Cell): string | undefined {
    if (c.discussion && c.discussion.length > 0) {
      return c.discussion[c.discussion.length - 1].timestamp;
    }
    return firstFlaggedAt.get(c.cellId);
  }

  const filtered = useMemo(() => {
    if (!codings) return [];
    const base = codings.cells.filter(c => {
      if (status !== "all" && c.status !== status) return false;
      if (tech !== "all" && c.tech !== tech) return false;
      if (changedOnly && !c.changedSinceLastVersion) return false;
      if (bothCodedOnly && (c.codesA.length === 0 || c.codesB.length === 0)) return false;
      return true;
    });

    if (sort === "ingest") return base;

    if (sort === "recent") {
      const withIdx = base.map((c, i) => ({ c, i, t: lastActivity(c) }));
      withIdx.sort((x, y) => {
        if (x.t && y.t) return y.t.localeCompare(x.t);
        if (x.t) return -1;
        if (y.t) return 1;
        return x.i - y.i;
      });
      return withIdx.map(x => x.c);
    }

    const withIdx = base.map((c, i) => ({ c, i, t: firstFlaggedAt.get(c.cellId) }));
    withIdx.sort((x, y) => {
      if (x.t && y.t) return x.t.localeCompare(y.t);
      if (x.t) return -1;
      if (y.t) return 1;
      return x.i - y.i;
    });
    return withIdx.map(x => x.c);
  }, [codings, status, tech, changedOnly, bothCodedOnly, sort, firstFlaggedAt]);

  useEffect(() => {
    setFocusIdx(i => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (filtered.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx(i => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx(i => Math.max(0, i - 1));
      } else if (e.key === "g") {
        e.preventDefault();
        setFocusIdx(0);
      } else if (e.key === "G") {
        e.preventDefault();
        setFocusIdx(filtered.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered.length]);

  useEffect(() => {
    const el = cardRefs.current[focusIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusIdx]);

  const counts = useMemo(() => {
    if (!codings) return { pending: 0, discussion: 0, resolved: 0, auto: 0 };
    return codings.cells.reduce((acc, c) => {
      acc[c.status]++;
      return acc;
    }, { pending: 0, discussion: 0, resolved: 0, auto: 0 } as Record<string, number>);
  }, [codings]);

  if (!codings || !log) return <div className="muted">Loading v{version}…</div>;

  async function updateCell(
    cellId: string,
    updater: (c: Cell) => Cell,
    logEntries: ReturnType<typeof makeLogEntry>[]
  ) {
    if (!codings || !log) return;
    const preWrite = codings.cells.find(c => c.cellId === cellId);
    if (!preWrite) return;
    setSaving(true);
    setError(null);
    const postWrite = updater(preWrite);
    const newCells = codings.cells.map(c => c.cellId === cellId ? postWrite : c);
    const newCodings: Codings = { ...codings, cells: newCells };
    const newLog: LogFile = { entries: [...log.entries, ...logEntries] };

    const r1 = await commit(`public/data/v${version}/codings.json`, newCodings,
      `reconcile: update ${cellId}`);
    if (!r1.ok) {
      setSaving(false);
      setError(r1.error === "conflict"
        ? "Conflict — reload to see the latest state."
        : r1.error);
      return;
    }
    const r2 = await commit("public/data/log.json", newLog, `log: ${cellId}`);
    if (!r2.ok) {
      setSaving(false);
      setError(r2.error === "conflict"
        ? "Log conflict — reload to see the latest state."
        : r2.error);
      return;
    }
    setCodings(newCodings);
    setLog(newLog);
    setSaving(false);
    // Register the watch so the poll can distinguish stale CDN from divergence.
    watchesRef.current.set(cellId, {
      preWrite, postWrite, createdAt: Date.now(),
    });
    // Dismiss any prior conflict banner on this cell since I just wrote.
    setConflicts(prev => {
      if (!prev.has(cellId)) return prev;
      const next = new Map(prev);
      next.delete(cellId);
      return next;
    });
  }

  function tryAutoResolve(cell: Cell): Cell {
    const a = new Set(cell.codesA);
    const b = new Set(cell.codesB);
    if (a.size === b.size && [...a].every(x => b.has(x))) {
      return { ...cell, harmonized: [...a].sort(), status: "resolved", changedSinceLastVersion: false };
    }
    return cell;
  }

  return (
    <div>
      <div className="filters">
        <label>Status
          <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
            <option value="all">All ({codings.cells.length})</option>
            <option value="pending">Pending ({counts.pending})</option>
            <option value="discussion">In discussion ({counts.discussion})</option>
            <option value="resolved">Resolved ({counts.resolved})</option>
            <option value="auto">Auto-matched ({counts.auto})</option>
          </select>
        </label>
        <label>Tech
          <select value={tech} onChange={e => setTech(e.target.value)}>
            <option value="all">All</option>
            {techs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Sort
          <select value={sort} onChange={e => setSort(e.target.value as SortMode)}>
            <option value="ingest">Ingest order</option>
            <option value="recent">Most recent activity</option>
            <option value="flagged">Flagged first (oldest flag)</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={bothCodedOnly}
            onChange={e => setBothCodedOnly(e.target.checked)} />
          Both coders have codes
        </label>
        <label>
          <input type="checkbox" checked={changedOnly}
            onChange={e => setChangedOnly(e.target.checked)} />
          Changed since previous version
        </label>
        <span style={{ flex: 1 }} />
        {saving && <span className="saving">Saving…</span>}
        {!isCurrent && <span className="pill changed">read-only (older version)</span>}
      </div>

      <div className="help-bar">
        <span><span className="kbd">j</span> / <span className="kbd">↓</span> next</span>
        <span><span className="kbd">k</span> / <span className="kbd">↑</span> previous</span>
        <span><span className="kbd">g</span> / <span className="kbd">G</span> top / bottom</span>
        <span><span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> submit comment</span>
        <span style={{ flex: 1 }} />
        {filtered.length > 0 && (
          <span>{focusIdx + 1} / {filtered.length}</span>
        )}
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {filtered.length === 0 && (
        <div className="card muted">No cells match the current filter.</div>
      )}

      {filtered.map((cell, i) => (
        <DiscrepancyCard
          key={cell.cellId}
          ref={el => { cardRefs.current[i] = el; }}
          cell={cell}
          answer={answersById[cell.cellId] || ""}
          coder={coder}
          version={version}
          disabled={!isCurrent || saving}
          focused={i === focusIdx}
          conflict={conflicts.get(cell.cellId)}
          onDismissConflict={() => {
            setConflicts(prev => {
              if (!prev.has(cell.cellId)) return prev;
              const next = new Map(prev);
              next.delete(cell.cellId);
              return next;
            });
          }}
          onAdopt={(code) => updateCell(cell.cellId, c => {
            const key = coder === "A" ? "codesA" : "codesB";
            if (c[key].includes(code)) return c;
            const updated: Cell = { ...c, [key]: [...c[key], code].sort() } as Cell;
            return tryAutoResolve(updated);
          }, [makeLogEntry(coder, cell.cellId, "adopt",
              cell.status === "discussion" ? "after_discussion" : "no_discussion", code)])
          }
          onConcede={(code) => updateCell(cell.cellId, c => {
            const key = coder === "A" ? "codesA" : "codesB";
            const updated: Cell = { ...c, [key]: c[key].filter(x => x !== code) } as Cell;
            return tryAutoResolve(updated);
          }, [makeLogEntry(coder, cell.cellId, "concede",
              cell.status === "discussion" ? "after_discussion" : "no_discussion", code)])
          }
          onAddCode={(code, applyToBoth) => updateCell(cell.cellId, c => {
            const myKey = coder === "A" ? "codesA" : "codesB";
            const otherKey = coder === "A" ? "codesB" : "codesA";
            let updated: Cell = { ...c };
            if (!updated[myKey].includes(code)) {
              updated = { ...updated, [myKey]: [...updated[myKey], code].sort() } as Cell;
            }
            if (applyToBoth && !updated[otherKey].includes(code)) {
              updated = { ...updated, [otherKey]: [...updated[otherKey], code].sort() } as Cell;
            }
            return tryAutoResolve(updated);
          }, [makeLogEntry(coder, cell.cellId,
              applyToBoth ? "add_bilateral" : "adopt",
              cell.status === "discussion" ? "after_discussion" : "no_discussion",
              code)])
          }
          onFlagDiscussion={(initialComment) => {
            const entries: DiscussionEntry[] = initialComment ? [{
              version, coder,
              text: initialComment,
              timestamp: new Date().toISOString(),
            }] : [];
            return updateCell(cell.cellId,
              c => ({
                ...c,
                status: "discussion",
                discussion: [...c.discussion, ...entries],
              }),
              [makeLogEntry(coder, cell.cellId, "flag_discussion", "no_discussion")]);
          }}
          onUnflag={() => updateCell(cell.cellId,
            c => ({ ...c, status: "pending" }),
            [makeLogEntry(coder, cell.cellId, "unflag_discussion", "after_discussion")])
          }
          onAppendDiscussion={(entry: DiscussionEntry) => updateCell(cell.cellId,
            c => ({ ...c, discussion: [...c.discussion, entry] }),
            [])
          }
        />
      ))}
    </div>
  );
}

// --- helpers ---

function normalizeCell(c: Cell): Cell {
  return {
    ...c,
    codesA: c.codesA.map(normalizeCode),
    codesB: c.codesB.map(normalizeCode),
    harmonized: c.harmonized ? c.harmonized.map(normalizeCode) : c.harmonized,
  };
}

function normalizeCodings(codings: Codings): Codings {
  return { ...codings, cells: codings.cells.map(normalizeCell) };
}
