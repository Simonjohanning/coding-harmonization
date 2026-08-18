import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Codings,
  Coder,
  DiscussionEntry,
  Manifest,
  Subcode,
  Subcoding,
  SubcodingCell,
  SubcodingRegistry,
} from "../lib/types";
import {
  commit, loadManifest, loadSubcoding, loadSubcodingRegistry, loadVersion,
} from "../lib/data";
import { isKnownCode, labelOf, normalizeCode } from "../lib/codes";
import SubcodingCard from "../components/SubcodingCard";

interface Props { coder: Coder }

type StatusFilter = "all" | "pending" | "discussion" | "resolved";

export default function SubcodingPage({ coder }: Props) {
  const { parent = "" } = useParams<{ parent: string }>();
  const nav = useNavigate();

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [codings, setCodings] = useState<Codings | null>(null);
  const [answersById, setAnswersById] = useState<Record<string, string>>({});
  const [subcoding, setSubcoding] = useState<Subcoding | null>(null);
  const [registry, setRegistry] = useState<SubcodingRegistry | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>("pending");
  const [tech, setTech] = useState<string>("all");
  const [focusIdx, setFocusIdx] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [wizardDrafts, setWizardDrafts] = useState<{ id: string; label: string }[]>([
    { id: "", label: "" },
    { id: "", label: "" },
  ]);
  const [addLabel, setAddLabel] = useState("");

  useEffect(() => {
    (async () => {
      const m = await loadManifest();
      setManifest(m);
      const v = m.current;
      setVersion(v);
      const { codings, answers } = await loadVersion(v);
      setCodings(codings);
      const map: Record<string, string> = {};
      for (const a of answers.cells) map[a.cellId] = a.answer;
      setAnswersById(map);
      setRegistry(await loadSubcodingRegistry(v));
      setSubcoding(await loadSubcoding(v, parent));
    })();
  }, [parent]);

  // Suggest the next free subcode id. Skips ids that collide with canonical
  // codes (e.g. subcoding PBC1 must NOT suggest PBC11..PBC13, which exist in
  // the codebook) and ids already taken in this subcoding.
  function suggestNextId(existing: string[]): string {
    let i = 1;
    for (;;) {
      const cand = `${parent}${i}`;
      if (!existing.includes(cand) && !isKnownCode(cand)) return cand;
      i++;
    }
  }

  function subcodeIdProblem(id: string, existing: string[]): string | null {
    const t = id.trim();
    if (!t) return "empty id";
    if (isKnownCode(t)) return `${t} is already a canonical code in the codebook`;
    if (existing.includes(t)) return `${t} is already defined in this subcoding`;
    if (!t.startsWith(parent)) return `${t} should start with ${parent}`;
    return null;
  }

  useEffect(() => {
    if (subcoding) return;
    setWizardDrafts(prev => {
      const next = [...prev];
      const existing: string[] = [];
      for (let i = 0; i < next.length; i++) {
        if (!next[i].id) next[i] = { ...next[i], id: suggestNextId(existing) };
        existing.push(next[i].id);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, subcoding]);

  const isCurrent = manifest && version === manifest.current;

  const parentCells = useMemo(() => {
    if (!codings) return [] as { cellId: string; rowId: string; tech: string; question: string }[];
    return codings.cells
      .filter(c => Array.isArray(c.harmonized) && c.harmonized!.map(normalizeCode).includes(parent))
      .map(c => ({ cellId: c.cellId, rowId: c.rowId, tech: c.tech, question: c.question }));
  }, [codings, parent]);

  const techs = useMemo(() => {
    if (!subcoding) return Array.from(new Set(parentCells.map(c => c.tech))).sort();
    return Array.from(new Set(subcoding.cells.map(c => c.tech))).sort();
  }, [subcoding, parentCells]);

  const filtered = useMemo(() => {
    if (!subcoding) return [];
    return subcoding.cells.filter(c => {
      if (status !== "all" && c.status !== status) return false;
      if (tech !== "all" && c.tech !== tech) return false;
      return true;
    });
  }, [subcoding, status, tech]);

  useEffect(() => {
    setFocusIdx(i => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (filtered.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault(); setFocusIdx(i => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1));
      } else if (e.key === "g") { e.preventDefault(); setFocusIdx(0); }
      else if (e.key === "G") { e.preventDefault(); setFocusIdx(filtered.length - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered.length]);

  useEffect(() => {
    const el = cardRefs.current[focusIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusIdx]);

  async function saveSubcoding(next: Subcoding, message: string) {
    if (version == null) return false;
    setSaving(true); setError(null);
    const r = await commit(
      `public/data/v${version}/subcodings/${parent}.json`,
      next,
      message,
    );
    if (!r.ok) {
      setSaving(false);
      setError(r.error === "conflict" ? "Conflict — reload to see latest." : r.error);
      return false;
    }
    setSubcoding(next);
    setSaving(false);
    return true;
  }

  async function updateRegistry(entry: { parent: string; minorVersion: number; completedAt: string | null }) {
    if (version == null) return;
    const current = registry ?? { version, entries: [] };
    const idx = current.entries.findIndex(e => e.parent === entry.parent);
    let entries;
    if (idx >= 0) { entries = [...current.entries]; entries[idx] = entry; }
    else { entries = [...current.entries, entry]; }
    const next: SubcodingRegistry = { version, entries };
    const r = await commit(
      `public/data/v${version}/subcodings/registry.json`,
      next,
      `registry: ${entry.parent}`,
    );
    if (r.ok) setRegistry(next);
  }

  async function updateManifestSubcoding(minorVersion: number, completedAt: string | null) {
    if (!manifest || version == null) return;
    const next: Manifest = {
      ...manifest,
      versions: manifest.versions.map(v => {
        if (v.n !== version) return v;
        const subs = v.subcodings ? { ...v.subcodings } : {};
        const existing = subs[parent];
        subs[parent] = {
          minorVersion,
          created: existing?.created ?? new Date().toISOString(),
          completedAt,
        };
        return { ...v, subcodings: subs };
      }),
    };
    const r = await commit("public/data/manifest.json", next, `manifest: subcoding ${parent} v${version}.${minorVersion}`);
    if (r.ok) setManifest(next);
  }

  // Cells that qualify (parent harmonized) but are not yet in the subcoding —
  // happens when Reconcile resolves more cells with the parent after the
  // subcoding pass started.
  const missingCells = useMemo(() => {
    if (!subcoding) return [];
    const have = new Set(subcoding.cells.map(c => c.cellId));
    return parentCells.filter(c => !have.has(c.cellId));
  }, [subcoding, parentCells]);

  async function syncNewCells() {
    if (!subcoding || missingCells.length === 0) return;
    const added: SubcodingCell[] = missingCells.map(c => ({
      cellId: c.cellId, rowId: c.rowId, tech: c.tech, question: c.question,
      codesA: [], codesB: [], harmonized: null,
      status: "pending", discussion: [],
    }));
    await saveSubcoding(
      { ...subcoding, cells: [...subcoding.cells, ...added] },
      `subcoding: sync ${added.length} new cell(s) into ${parent}`,
    );
  }

  // ---- Finalize / unfinalize: propagate resolved subcodings back into
  // the main codings.json (swap parent for subcodes in the harmonized set).

  async function finalizeCellInCodings(cellId: string, subcodesForCell: string[]) {
    if (!codings || version == null) return true;
    const nextCells = codings.cells.map(c => {
      if (c.cellId !== cellId) return c;
      if (!c.harmonized) return c;
      const withoutParent = c.harmonized.filter(x => normalizeCode(x) !== parent);
      const merged = [...new Set([...withoutParent, ...subcodesForCell])].sort();
      return { ...c, harmonized: merged };
    });
    const next: Codings = { ...codings, cells: nextCells };
    const r = await commit(
      `public/data/v${version}/codings.json`,
      next,
      `finalize: ${parent} → ${subcodesForCell.join(",") || "(none)"} on ${cellId}`,
    );
    if (!r.ok) {
      setError(`Finalize failed: ${r.error}. The subcoding is saved but main codings.json still has ${parent}. Reload and retry.`);
      return false;
    }
    setCodings(next);
    return true;
  }

  async function unfinalizeCellInCodings(cellId: string) {
    if (!codings || version == null || !subcoding) return true;
    const subcodeIds = new Set(subcoding.subcodes.map(s => s.id));
    const nextCells = codings.cells.map(c => {
      if (c.cellId !== cellId) return c;
      if (!c.harmonized) return c;
      const withoutSubcodes = c.harmonized.filter(x => !subcodeIds.has(x));
      const withParent = withoutSubcodes.includes(parent)
        ? withoutSubcodes
        : [...withoutSubcodes, parent].sort();
      return { ...c, harmonized: withParent };
    });
    const next: Codings = { ...codings, cells: nextCells };
    const r = await commit(
      `public/data/v${version}/codings.json`,
      next,
      `unfinalize: ${parent} back on ${cellId}`,
    );
    if (!r.ok) {
      setError(`Unfinalize failed: ${r.error}.`);
      return false;
    }
    setCodings(next);
    return true;
  }

  function tryAutoResolve(c: SubcodingCell): SubcodingCell {
    const a = new Set(c.codesA);
    const b = new Set(c.codesB);
    if (a.size === b.size && [...a].every(x => b.has(x))) {
      return { ...c, harmonized: [...a].sort(), status: "resolved" };
    }
    return c;
  }

  async function updateCell(
    cellId: string,
    updater: (c: SubcodingCell) => SubcodingCell,
    msg: string,
  ) {
    if (!subcoding) return;
    const before = subcoding.cells.find(c => c.cellId === cellId);
    if (!before) return;
    const after = updater(before);

    const nextSubcoding: Subcoding = {
      ...subcoding,
      cells: subcoding.cells.map(c => c.cellId === cellId ? after : c),
    };
    const ok = await saveSubcoding(nextSubcoding, msg);
    if (!ok) return;

    const becameResolved = before.status !== "resolved" && after.status === "resolved";
    const becameUnresolved = before.status === "resolved" && after.status !== "resolved";

    if (becameResolved && after.harmonized) {
      await finalizeCellInCodings(cellId, after.harmonized);
    } else if (becameUnresolved) {
      await unfinalizeCellInCodings(cellId);
    }
  }

  async function startSubcoding() {
    const valid = wizardDrafts.filter(d => d.id.trim() && d.label.trim());
    if (valid.length < 2) {
      alert("Define at least 2 subcodes to start.");
      return;
    }
    const seen: string[] = [];
    for (const d of valid) {
      const prob = subcodeIdProblem(d.id, seen);
      if (prob) { alert(`Invalid subcode id: ${prob}`); return; }
      seen.push(d.id.trim());
    }
    if (version == null) return;

    const now = new Date().toISOString();
    const subcodes: Subcode[] = valid.map(d => ({
      id: d.id.trim(),
      label: d.label.trim(),
      createdAt: now,
      createdBy: coder,
    }));

    const cells: SubcodingCell[] = parentCells.map(c => ({
      cellId: c.cellId,
      rowId: c.rowId,
      tech: c.tech,
      question: c.question,
      codesA: [],
      codesB: [],
      harmonized: null,
      status: "pending",
      discussion: [],
    }));

    const existingMinors = (manifest?.versions.find(v => v.n === version)?.subcodings ?? {}) as Record<string, { minorVersion: number }>;
    const usedMinors = Object.values(existingMinors).map(s => s.minorVersion);
    const nextMinor = usedMinors.length ? Math.max(...usedMinors) + 1 : 1;

    const next: Subcoding = {
      version, minorVersion: nextMinor, parent, subcodes, cells,
      createdAt: now, completedAt: null,
    };

    const ok = await saveSubcoding(next, `subcoding: start ${parent}`);
    if (ok) {
      await updateRegistry({ parent, minorVersion: nextMinor, completedAt: null });
      await updateManifestSubcoding(nextMinor, null);
    }
  }

  async function addSubcodeDef(label: string) {
    if (!subcoding || !label.trim()) return;
    const id = suggestNextId(subcoding.subcodes.map(s => s.id));
    const prob = subcodeIdProblem(id, subcoding.subcodes.map(s => s.id));
    if (prob) { alert(`Cannot add subcode: ${prob}`); return; }
    const next: Subcoding = {
      ...subcoding,
      subcodes: [...subcoding.subcodes, {
        id, label: label.trim(),
        createdAt: new Date().toISOString(),
        createdBy: coder,
      }],
    };
    const ok = await saveSubcoding(next, `subcoding: add ${id} (${label})`);
    if (ok) setAddLabel("");
  }

  async function editSubcodeLabel(id: string, label: string) {
    if (!subcoding) return;
    const next: Subcoding = {
      ...subcoding,
      subcodes: subcoding.subcodes.map(s => s.id === id ? { ...s, label } : s),
    };
    await saveSubcoding(next, `subcoding: label ${id}`);
  }

  async function deleteSubcode(id: string) {
    if (!subcoding) return;
    const usedByAnyone = subcoding.cells.some(c =>
      c.codesA.includes(id) || c.codesB.includes(id) || (c.harmonized ?? []).includes(id)
    );
    if (usedByAnyone) {
      if (!confirm(`${id} is currently assigned to at least one cell. Delete anyway?`)) return;
    }
    const next: Subcoding = {
      ...subcoding,
      subcodes: subcoding.subcodes.filter(s => s.id !== id),
      cells: subcoding.cells.map(c => ({
        ...c,
        codesA: c.codesA.filter(x => x !== id),
        codesB: c.codesB.filter(x => x !== id),
        harmonized: c.harmonized ? c.harmonized.filter(x => x !== id) : c.harmonized,
      })),
    };
    await saveSubcoding(next, `subcoding: delete ${id}`);
    // Also strip from main codings.json anywhere it may have been finalized
    if (codings && version != null) {
      const nextCells = codings.cells.map(c => {
        if (!c.harmonized || !c.harmonized.includes(id)) return c;
        return { ...c, harmonized: c.harmonized.filter(x => x !== id) };
      });
      const nextCodings: Codings = { ...codings, cells: nextCells };
      const changed = nextCells.some((c, i) => c.harmonized !== codings.cells[i].harmonized);
      if (changed) {
        const r = await commit(
          `public/data/v${version}/codings.json`,
          nextCodings,
          `strip ${id} from harmonized (subcode deleted)`,
        );
        if (r.ok) setCodings(nextCodings);
      }
    }
  }

  if (!version || !codings) return <div className="muted">Loading…</div>;
  if (!isCurrent) return (
    <div className="card">
      Subcoding is only available on the current version.
      Currently viewing v{version}, current is v{manifest?.current}.
    </div>
  );

  // -------- Setup wizard --------

  if (!subcoding) {
    return (
      <div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Start subcoding {parent}</h3>
          <p className="muted">
            {labelOf(parent) && <>{labelOf(parent)}. </>}
            This parent code is currently harmonized on <strong>{parentCells.length}</strong> cell(s).
            Define at least 2 subcodes to begin.
          </p>

          {wizardDrafts.map((d, i) => (
            <div key={i} className="wizard-row">
              <input
                className="wizard-id"
                value={d.id}
                onChange={e => {
                  const v = e.target.value;
                  setWizardDrafts(prev => prev.map((x, j) => j === i ? { ...x, id: v } : x));
                }}
                placeholder={`${parent}${i + 1}`}
              />
              <input
                className="wizard-label"
                value={d.label}
                onChange={e => {
                  const v = e.target.value;
                  setWizardDrafts(prev => prev.map((x, j) => j === i ? { ...x, label: v } : x));
                }}
                placeholder="label"
              />
              {wizardDrafts.length > 2 && (
                <button className="btn sm" onClick={() =>
                  setWizardDrafts(prev => prev.filter((_, j) => j !== i))
                }>×</button>
              )}
            </div>
          ))}

          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => setWizardDrafts(prev => {
              const existing = prev.map(x => x.id).filter(Boolean);
              return [...prev, { id: suggestNextId(existing), label: "" }];
            })}>
              + Add another subcode
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={startSubcoding} disabled={saving}>
              Start subcoding
            </button>
            <button className="btn" style={{ marginLeft: 8 }} onClick={() => nav("/frequency")}>
              Cancel
            </button>
          </div>
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    );
  }

  // -------- Active subcoding page --------

  const counts = subcoding.cells.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const total = subcoding.cells.length;
  const resolved = counts.resolved || 0;

  return (
    <div>
      <div className="card">
        <h3 style={{ margin: 0 }}>
          Refining {parent}
          {labelOf(parent) && <span className="muted"> — {labelOf(parent)}</span>}
          <span className="muted" style={{ fontSize: 13, marginLeft: 12 }}>
            v{subcoding.version}.{subcoding.minorVersion} · {resolved} / {total} resolved
          </span>
        </h3>

        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
            Subcodes
          </div>
          <div className="subcode-list">
            {subcoding.subcodes.map(s => (
              <SubcodeChipEditor
                key={s.id}
                subcode={s}
                onEditLabel={label => editSubcodeLabel(s.id, label)}
                onDelete={() => deleteSubcode(s.id)}
                disabled={saving}
              />
            ))}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
              placeholder={`Label for ${suggestNextId(subcoding.subcodes.map(s => s.id))}`}
              style={{ padding: "5px 8px", border: "1px solid var(--border-strong)", borderRadius: 4, flex: "0 1 260px" }}
              onKeyDown={e => { if (e.key === "Enter") addSubcodeDef(addLabel); }}
            />
            <button className="btn sm" onClick={() => addSubcodeDef(addLabel)} disabled={!addLabel.trim() || saving}>
              + Add subcode
            </button>
            {missingCells.length > 0 && (
              <button className="btn sm warn" onClick={syncNewCells} disabled={saving}
                title="Cells resolved with the parent code after this subcoding started">
                Sync {missingCells.length} new cell(s)
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="filters">
        <label>Status
          <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
            <option value="all">All ({total})</option>
            <option value="pending">Pending ({counts.pending || 0})</option>
            <option value="discussion">Discussion ({counts.discussion || 0})</option>
            <option value="resolved">Resolved ({resolved})</option>
          </select>
        </label>
        <label>Tech
          <select value={tech} onChange={e => setTech(e.target.value)}>
            <option value="all">All</option>
            {techs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {saving && <span className="saving">Saving…</span>}
        <button className="btn sm" onClick={() => nav("/frequency")}>Back to frequency</button>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="help-bar">
        <span><span className="kbd">j</span>/<span className="kbd">↓</span> next</span>
        <span><span className="kbd">k</span>/<span className="kbd">↑</span> previous</span>
        <span><span className="kbd">g</span>/<span className="kbd">G</span> top/bottom</span>
        <span style={{ flex: 1 }} />
        {filtered.length > 0 && <span>{focusIdx + 1} / {filtered.length}</span>}
      </div>

      {filtered.length === 0 && (
        <div className="card muted">No cells match.</div>
      )}

      {filtered.map((cell, i) => (
        <SubcodingCard
          key={cell.cellId}
          ref={el => { cardRefs.current[i] = el; }}
          cell={cell}
          answer={answersById[cell.cellId] || ""}
          coder={coder}
          version={version}
          minorVersion={subcoding.minorVersion}
          parent={parent}
          subcodes={subcoding.subcodes}
          disabled={saving}
          focused={i === focusIdx}
          onToggleMine={(id) => updateCell(cell.cellId, c => {
            const key = coder === "A" ? "codesA" : "codesB";
            const has = c[key].includes(id);
            const updated: SubcodingCell = {
              ...c,
              [key]: has ? c[key].filter(x => x !== id) : [...c[key], id].sort(),
            } as SubcodingCell;
            return tryAutoResolve(updated);
          }, `subcoding: ${coder} toggle ${id} on ${cell.cellId}`)}
          onAdopt={(id) => updateCell(cell.cellId, c => {
            const key = coder === "A" ? "codesA" : "codesB";
            if (c[key].includes(id)) return c;
            const updated: SubcodingCell = { ...c, [key]: [...c[key], id].sort() } as SubcodingCell;
            return tryAutoResolve(updated);
          }, `subcoding: ${coder} adopt ${id} on ${cell.cellId}`)}
          onConcede={(id) => updateCell(cell.cellId, c => {
            const key = coder === "A" ? "codesA" : "codesB";
            const updated: SubcodingCell = { ...c, [key]: c[key].filter(x => x !== id) } as SubcodingCell;
            return tryAutoResolve(updated);
          }, `subcoding: ${coder} concede ${id} on ${cell.cellId}`)}
          onAddBoth={(id) => updateCell(cell.cellId, c => {
            const updated: SubcodingCell = {
              ...c,
              codesA: c.codesA.includes(id) ? c.codesA : [...c.codesA, id].sort(),
              codesB: c.codesB.includes(id) ? c.codesB : [...c.codesB, id].sort(),
            } as SubcodingCell;
            return tryAutoResolve(updated);
          }, `subcoding: ${coder} add ${id} to both on ${cell.cellId}`)}
          onFlagDiscussion={(comment) => {
            const entries: DiscussionEntry[] = comment ? [{
              version, coder, text: comment,
              timestamp: new Date().toISOString(),
            }] : [];
            return updateCell(cell.cellId, c => ({
              ...c,
              status: "discussion",
              discussion: [...c.discussion, ...entries],
            }), `subcoding: flag ${cell.cellId}`);
          }}
          onUnflag={() => updateCell(cell.cellId,
            c => ({ ...c, status: "pending" }),
            `subcoding: unflag ${cell.cellId}`)}
          onUnresolve={() => updateCell(cell.cellId,
            c => ({ ...c, status: "pending", harmonized: null }),
            `subcoding: unresolve ${cell.cellId}`)}
          onAppendDiscussion={(entry) => updateCell(cell.cellId,
            c => ({ ...c, discussion: [...c.discussion, entry] }),
            `subcoding: comment ${cell.cellId}`)}
        />
      ))}
    </div>
  );
}

function SubcodeChipEditor({
  subcode, onEditLabel, onDelete, disabled,
}: {
  subcode: Subcode;
  onEditLabel: (label: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(subcode.label);
  useEffect(() => { setDraft(subcode.label); }, [subcode.label]);

  if (editing) return (
    <span className="subcode-def editing">
      <span className="code">{subcode.id}</span>
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { onEditLabel(draft); setEditing(false); }
          else if (e.key === "Escape") { setDraft(subcode.label); setEditing(false); }
        }}
        autoFocus
      />
      <button className="btn sm" onClick={() => { onEditLabel(draft); setEditing(false); }}>save</button>
      <button className="btn sm" onClick={() => { setDraft(subcode.label); setEditing(false); }}>cancel</button>
    </span>
  );

  return (
    <span className="subcode-def">
      <span className="code">{subcode.id}</span>
      <span className="label">{subcode.label}</span>
      <button className="mini" onClick={() => setEditing(true)} title="Edit label" disabled={disabled}>✎</button>
      <button className="mini" onClick={onDelete} title="Delete subcode" disabled={disabled}>×</button>
    </span>
  );
}
