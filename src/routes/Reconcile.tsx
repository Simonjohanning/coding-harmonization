import { useEffect, useMemo, useState } from "react";
import type { Cell, Codings, Coder, DiscussionEntry, LogFile } from "../lib/types";
import { commit, loadLog, loadVersion, makeLogEntry } from "../lib/data";
import DiscrepancyCard from "../components/DiscrepancyCard";

interface Props {
  version: number;
  coder: Coder;
  isCurrent: boolean;
}

type StatusFilter = "all" | "pending" | "discussion" | "resolved" | "auto";

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
  useEffect(() => {
    (async () => {
      const { answers, codings } = await loadVersion(version);
      setCodings(codings);
      const map: Record<string, string> = {};
      for (const a of answers.cells) map[a.cellId] = a.answer;
      setAnswersById(map);
      setLog(await loadLog());
    })();
  }, [version]);

  const techs = useMemo(() => {
    if (!codings) return [];
    return Array.from(new Set(codings.cells.map(c => c.tech))).sort();
  }, [codings]);

  const filtered = useMemo(() => {
    if (!codings) return [];
    return codings.cells.filter(c => {
      if (status !== "all" && c.status !== status) return false;
      if (tech !== "all" && c.tech !== tech) return false;
      if (changedOnly && !c.changedSinceLastVersion) return false;
      if (bothCodedOnly && (c.codesA.length === 0 || c.codesB.length === 0)) return false;
      return true;
    });
  }, [codings, status, tech, changedOnly, bothCodedOnly]);

  const counts = useMemo(() => {
    if (!codings) return { pending: 0, discussion: 0, resolved: 0, auto: 0 };
    return codings.cells.reduce((acc, c) => {
      acc[c.status]++;
      return acc;
    }, { pending: 0, discussion: 0, resolved: 0, auto: 0 } as Record<string, number>);
  }, [codings]);

  if (!codings || !log) return <div>Loading v{version}…</div>;

  async function updateCell(cellId: string, updater: (c: Cell) => Cell, logEntries: ReturnType<typeof makeLogEntry>[]) {
    if (!codings || !log) return;
    setSaving(true);
    setError(null);
    const newCells = codings.cells.map(c => c.cellId === cellId ? updater(c) : c);
    const newCodings: Codings = { ...codings, cells: newCells };
    const newLog: LogFile = { entries: [...log.entries, ...logEntries] };

    // Commit both files. On conflict, tell user to reload.
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
  }

  function tryAutoResolve(cell: Cell): Cell {
    // If A and B match now, promote to resolved
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
        <label>Status:&nbsp;
          <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
            <option value="all">All ({codings.cells.length})</option>
            <option value="pending">Pending ({counts.pending})</option>
            <option value="discussion">In discussion ({counts.discussion})</option>
            <option value="resolved">Resolved ({counts.resolved})</option>
            <option value="auto">Auto-matched ({counts.auto})</option>
          </select>
        </label>
        <label>Tech:&nbsp;
          <select value={tech} onChange={e => setTech(e.target.value)}>
            <option value="all">All</option>
            {techs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={changedOnly}
            onChange={e => setChangedOnly(e.target.checked)} />
          &nbsp;Changed since previous version only
        </label>
		<label>
          <input type="checkbox" checked={bothCodedOnly}
            onChange={e => setBothCodedOnly(e.target.checked)} />
          &nbsp;Both coders have codes
        </label>
        <div className="spacer" style={{ flex: 1 }} />
        {saving && <span className="muted">Saving…</span>}
        {error && <span className="error">{error}</span>}
        {!isCurrent && <span className="pill changed">read-only (older version)</span>}
      </div>

      {filtered.length === 0 && (
        <div className="card muted">No cells match the current filter.</div>
      )}

      {filtered.map(cell => (
        <DiscrepancyCard
          key={cell.cellId}
          cell={cell}
          answer={answersById[cell.cellId] || ""}
          coder={coder}
          version={version}
          disabled={!isCurrent || saving}
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
          onFlagDiscussion={() => updateCell(cell.cellId,
            c => ({ ...c, status: "discussion" }),
            [makeLogEntry(coder, cell.cellId, "flag_discussion", "no_discussion")])
          }
          onUnflag={() => updateCell(cell.cellId,
            c => ({ ...c, status: "pending" }),
            [makeLogEntry(coder, cell.cellId, "unflag_discussion", "after_discussion")])
          }
          onResolveAfterDiscussion={() => updateCell(cell.cellId, c => {
            // Harmonized = intersection: codes both coders currently hold
            // (either both originally coded them, or one adopted from the other).
            const b = new Set(c.codesB);
            const inter = c.codesA.filter(x => b.has(x)).sort();
            return { ...c, status: "resolved", harmonized: inter };
          }, [makeLogEntry(coder, cell.cellId, "resolved_after_discussion", "after_discussion")])
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
