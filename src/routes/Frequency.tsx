import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell as RCell, Legend, CartesianGrid,
} from "recharts";
import type { Codings, Answers, Labels, Cell as CodingCell } from "../lib/types";
import { commit, loadLabels, loadVersion } from "../lib/data";
import { familyOf } from "../lib/codes";

interface Props { version: number; }

type ChartType = "vbar" | "hbar" | "pie" | "donut" | "lollipop";
type SortMode =
  | { by: "code"; dir: "asc" | "desc" }
  | { by: "total"; dir: "asc" | "desc" }
  | { by: "tech"; tech: string; dir: "asc" | "desc" };

const COLORS = ["#0369a1", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#65a30d"];

export default function Frequency({ version }: Props) {
  const [codings, setCodings] = useState<Codings | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [labels, setLabels] = useState<Labels>({});
  const [savingLabel, setSavingLabel] = useState<string | null>(null);

  const [techFilter, setTechFilter] = useState<string>("all");
  const [chart, setChart] = useState<ChartType>("vbar");
  const [sort, setSort] = useState<SortMode>({ by: "total", dir: "desc" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ codings, answers }, lbl] = await Promise.all([
        loadVersion(version), loadLabels(),
      ]);
      setCodings(codings); setAnswers(answers); setLabels(lbl);
    })();
  }, [version]);

  const techs = useMemo(() => {
    if (!codings) return [];
    return Array.from(new Set(codings.cells.map(c => c.tech))).sort();
  }, [codings]);

  // Only use harmonized codes from resolved/auto cells
  const usableCells = useMemo(() => {
    if (!codings) return [];
    return codings.cells.filter(c =>
      (c.status === "auto" || c.status === "resolved") &&
      Array.isArray(c.harmonized)
    );
  }, [codings]);

  // Aggregate: for each code, total count + per-tech count
  const agg = useMemo(() => {
    const map = new Map<string, { total: number; byTech: Record<string, number>; cellIds: string[] }>();
    for (const c of usableCells) {
      if (techFilter !== "all" && c.tech !== techFilter) continue;
      for (const code of c.harmonized!) {
        let entry = map.get(code);
        if (!entry) { entry = { total: 0, byTech: {}, cellIds: [] }; map.set(code, entry); }
        entry.total += 1;
        entry.byTech[c.tech] = (entry.byTech[c.tech] || 0) + 1;
        entry.cellIds.push(c.cellId);
      }
    }
    return map;
  }, [usableCells, techFilter]);

  const groups = useMemo(() => {
    const byFam: Record<"A" | "PBC" | "SN", string[]> = { A: [], PBC: [], SN: [] };
    for (const code of agg.keys()) {
      const fam = familyOf(code);
      if (fam !== "other") byFam[fam].push(code);
    }
    return byFam;
  }, [agg]);

  const answersByCellId = useMemo(() => {
    const m = new Map<string, { tech: string; rowId: string; question: string; answer: string }>();
    if (answers) for (const a of answers.cells) m.set(a.cellId, a);
    return m;
  }, [answers]);

  if (!codings || !answers) return <div>Loading v{version}…</div>;

  function sortCodes(codes: string[]): string[] {
    return [...codes].sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sort.by === "code") { va = a; vb = b; }
      else if (sort.by === "total") { va = agg.get(a)!.total; vb = agg.get(b)!.total; }
      else { va = agg.get(a)!.byTech[sort.tech] || 0; vb = agg.get(b)!.byTech[sort.tech] || 0; }
      const cmp = typeof va === "number" ? (va - (vb as number)) : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }

  async function saveLabel(code: string, text: string) {
    setSavingLabel(code);
    const newLabels = { ...labels, [code]: text };
    const r = await commit("public/data/labels.json", newLabels, `labels: ${code}`);
    setSavingLabel(null);
    if (r.ok) setLabels(newLabels);
    else alert("Save failed: " + r.error);
  }

  function toggleHidden(code: string) {
    setHidden(prev => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code); else s.add(code);
      return s;
    });
  }

  function renderChart(codes: string[]) {
    const visible = codes.filter(c => !hidden.has(c));
    const data = visible.map(code => ({
      code,
      total: agg.get(code)!.total,
      ...Object.fromEntries(techs.map(t => [t, agg.get(code)!.byTech[t] || 0])),
    }));

    if (chart === "pie" || chart === "donut") {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="code"
              innerRadius={chart === "donut" ? 50 : 0} outerRadius={100} label>
              {data.map((_, i) => <RCell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chart === "hbar") {
      return (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 24)}>
          <BarChart layout="vertical" data={data} margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="code" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="total" fill={COLORS[0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chart === "lollipop") {
      // Draw as horizontal bars with narrow bars — recharts doesn't have native lollipop
      return (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 24)}>
          <BarChart layout="vertical" data={data} margin={{ left: 40 }} barSize={2}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="code" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="total" fill={COLORS[0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    // vertical bar (default)
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="code" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="total" fill={COLORS[0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div>
      <div className="filters">
        <label>Tech:&nbsp;
          <select value={techFilter} onChange={e => setTechFilter(e.target.value)}>
            <option value="all">All (totals)</option>
            {techs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Chart:&nbsp;
          <select value={chart} onChange={e => setChart(e.target.value as ChartType)}>
            <option value="vbar">Bar (vertical)</option>
            <option value="hbar">Bar (horizontal)</option>
            <option value="pie">Pie</option>
            <option value="donut">Donut</option>
            <option value="lollipop">Lollipop</option>
          </select>
        </label>
        <button className="btn sm" onClick={() => setHidden(new Set())}>Show all in chart</button>
      </div>

      {(["A", "PBC", "SN"] as const).map(fam => {
        const codes = groups[fam];
        if (codes.length === 0) return (
          <div key={fam}>
            <div className="section-header">{fam}</div>
            <div className="card muted">No codes in this family yet.</div>
          </div>
        );
        const sorted = sortCodes(codes);
        return (
          <div key={fam}>
            <div className="section-header">{fam} ({codes.length} codes)</div>

            <div className="chart-panel">
              {renderChart(sorted)}
            </div>

            <FreqTable
              codes={sorted}
              techs={techs}
              agg={agg}
              labels={labels}
              labelDrafts={labelDrafts}
              onLabelChange={(code, v) => setLabelDrafts(prev => ({ ...prev, [code]: v }))}
              onLabelBlur={(code) => {
                const v = labelDrafts[code];
                if (v !== undefined && v !== (labels[code] || "")) saveLabel(code, v);
              }}
              savingLabel={savingLabel}
              sort={sort}
              onSort={setSort}
              hidden={hidden}
              onToggleHidden={toggleHidden}
              expandedCode={expandedCode}
              onToggleExpand={(code) => setExpandedCode(prev => prev === code ? null : code)}
              answersByCellId={answersByCellId}
            />
          </div>
        );
      })}
    </div>
  );
}

interface TableProps {
  codes: string[];
  techs: string[];
  agg: Map<string, { total: number; byTech: Record<string, number>; cellIds: string[] }>;
  labels: Labels;
  labelDrafts: Record<string, string>;
  onLabelChange: (code: string, v: string) => void;
  onLabelBlur: (code: string) => void;
  savingLabel: string | null;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  hidden: Set<string>;
  onToggleHidden: (code: string) => void;
  expandedCode: string | null;
  onToggleExpand: (code: string) => void;
  answersByCellId: Map<string, { tech: string; rowId: string; question: string; answer: string }>;
}

function FreqTable(p: TableProps) {
  const clickSort = (target: SortMode["by"] extends infer T ? T : never, tech?: string) => {
    if (target === "tech" && tech) {
      if (p.sort.by === "tech" && p.sort.tech === tech) {
        p.onSort({ by: "tech", tech, dir: p.sort.dir === "asc" ? "desc" : "asc" });
      } else p.onSort({ by: "tech", tech, dir: "desc" });
    } else if (target === "total") {
      if (p.sort.by === "total") p.onSort({ by: "total", dir: p.sort.dir === "asc" ? "desc" : "asc" });
      else p.onSort({ by: "total", dir: "desc" });
    } else if (target === "code") {
      if (p.sort.by === "code") p.onSort({ by: "code", dir: p.sort.dir === "asc" ? "desc" : "asc" });
      else p.onSort({ by: "code", dir: "asc" });
    }
  };
  const arrow = (active: boolean) =>
    active ? (p.sort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <table className="freq-table">
      <thead>
        <tr>
          <th style={{ width: 20 }}></th>
          <th onClick={() => clickSort("code")}>Code{arrow(p.sort.by === "code")}</th>
          <th className="numeric" onClick={() => clickSort("total")}>Total{arrow(p.sort.by === "total")}</th>
          {p.techs.map(t => (
            <th key={t} className="numeric" onClick={() => clickSort("tech", t)}>
              {t}{arrow(p.sort.by === "tech" && (p.sort as any).tech === t)}
            </th>
          ))}
          <th style={{ minWidth: 200 }}>Belief label</th>
        </tr>
      </thead>
      <tbody>
        {p.codes.map(code => {
          const row = p.agg.get(code)!;
          const isHidden = p.hidden.has(code);
          const isExpanded = p.expandedCode === code;
          return (
            <>
              <tr key={code} className={isHidden ? "hidden-in-chart" : ""}>
                <td>
                  <input type="checkbox" checked={!isHidden}
                    onChange={() => p.onToggleHidden(code)}
                    title="Include in chart" />
                </td>
                <td>
                  <button className="expand-btn" onClick={() => p.onToggleExpand(code)}>
                    {isExpanded ? "▾" : "▸"} {code}
                  </button>
                </td>
                <td className="numeric">{row.total}</td>
                {p.techs.map(t => (
                  <td key={t} className="numeric">{row.byTech[t] || 0}</td>
                ))}
                <td>
                  <input
                    className="label-input"
                    value={p.labelDrafts[code] ?? p.labels[code] ?? ""}
                    onChange={e => p.onLabelChange(code, e.target.value)}
                    onBlur={() => p.onLabelBlur(code)}
                    placeholder="Enter belief label…"
                  />
                  {p.savingLabel === code && <span className="muted"> saving…</span>}
                </td>
              </tr>
              {isExpanded && (
                <tr key={code + "_exp"} className="code-expand-row">
                  <td colSpan={3 + p.techs.length + 1}>
                    <ExpandedAnswers cellIds={row.cellIds} answersByCellId={p.answersByCellId} />
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
  );
}

function ExpandedAnswers({
  cellIds, answersByCellId,
}: {
  cellIds: string[];
  answersByCellId: Map<string, { tech: string; rowId: string; question: string; answer: string }>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byTech = new Map<string, string[]>();
  for (const id of cellIds) {
    const a = answersByCellId.get(id);
    if (!a) continue;
    if (!byTech.has(a.tech)) byTech.set(a.tech, []);
    byTech.get(a.tech)!.push(id);
  }
  return (
    <div>
      {[...byTech.entries()].map(([tech, ids]) => (
        <div key={tech} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{tech} ({ids.length})</div>
          {ids.map(id => {
            const a = answersByCellId.get(id)!;
            const isOpen = openId === id;
            const preview = a.answer.length > 200 && !isOpen
              ? a.answer.slice(0, 200) + "…" : a.answer;
            return (
              <div key={id} style={{ padding: "6px 0", borderBottom: "1px dashed var(--border)" }}>
                <div className="muted" style={{ fontSize: 11 }}>
                  {a.rowId} · {a.question}
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{preview}</div>
                {a.answer.length > 200 && (
                  <button className="expand-btn"
                    onClick={() => setOpenId(isOpen ? null : id)}>
                    {isOpen ? "Collapse" : "Expand"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
