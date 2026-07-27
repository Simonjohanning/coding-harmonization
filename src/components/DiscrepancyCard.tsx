import { useState } from "react";
import type { Cell, Coder, DiscussionEntry } from "../lib/types";
import { isKnownCode } from "../lib/codes";

interface Props {
  cell: Cell;
  answer: string;
  coder: Coder;
  version: number;
  disabled?: boolean;
  onAdopt: (code: string) => void;
  onConcede: (code: string) => void;
  onFlagDiscussion: () => void;
  onUnflag: () => void;
  onResolveAfterDiscussion: () => void;
  onAppendDiscussion: (entry: DiscussionEntry) => void;
}

export default function DiscrepancyCard(p: Props) {
  const { cell, answer, coder, disabled } = p;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const mine = coder === "A" ? cell.codesA : cell.codesB;
  const theirs = coder === "A" ? cell.codesB : cell.codesA;
  const shared = mine.filter(c => theirs.includes(c));
  const onlyMine = mine.filter(c => !theirs.includes(c));
  const onlyTheirs = theirs.filter(c => !mine.includes(c));
  const inDiscussion = cell.status === "discussion";

  const showAnswer = answer.length > 240 && !expanded
    ? { text: answer.slice(0, 240) + "…", truncated: true }
    : { text: answer, truncated: false };

  return (
    <div className="card">
      <h3>
        <StatusPill status={cell.status} />
        {cell.changedSinceLastVersion &&
          <span className="pill changed">changed since v{cell.carriedFromVersion ?? "?"}</span>}
        {cell.tech} · {cell.rowId} · {cell.question}
      </h3>

      <div className={"answer" + (showAnswer.truncated ? " collapsed" : "")}>
        {answer || <span className="muted">(empty answer)</span>}
      </div>
      {answer.length > 240 && (
        <button className="expand-btn" onClick={() => setExpanded(x => !x)}>
          {expanded ? "Collapse" : "Expand answer"}
        </button>
      )}

      {shared.length > 0 && (
        <div className="chip-row">
          <span className="label">Shared:</span>
          {shared.map(c => (
            <span key={c} className={`chip shared ${isKnownCode(c) ? "" : "unknown"}`}>{c}</span>
          ))}
        </div>
      )}

      <div className="chip-row">
        <span className="label">You (Coder {coder}):</span>
        {onlyMine.length === 0 && <span className="muted">no unique codes</span>}
        {onlyMine.map(c => (
          <span key={c} className={`chip a ${isKnownCode(c) ? "" : "unknown"}`}>
            {c}
            {!disabled && (
              <button title="Concede — remove from your codes"
                onClick={() => p.onConcede(c)}>×</button>
            )}
          </span>
        ))}
      </div>

      <div className="chip-row">
        <span className="label">Coder {coder === "A" ? "B" : "A"}:</span>
        {onlyTheirs.length === 0 && <span className="muted">no unique codes</span>}
        {onlyTheirs.map(c => (
          <span key={c} className={`chip b ${isKnownCode(c) ? "" : "unknown"}`}>
            {c}
            {!disabled && (
              <button title="Adopt — add to your codes"
                onClick={() => p.onAdopt(c)}>+</button>
            )}
          </span>
        ))}
      </div>

      {cell.harmonized && cell.harmonized.length > 0 && (
        <div className="chip-row">
          <span className="label">Harmonized:</span>
          {cell.harmonized.map(c => <span key={c} className="chip harm">{c}</span>)}
        </div>
      )}

      <div className="row-actions">
        {!inDiscussion ? (
          <button className="btn warn" onClick={p.onFlagDiscussion} disabled={disabled}>
            Flag for discussion
          </button>
        ) : (
          <>
            <button className="btn" onClick={p.onUnflag} disabled={disabled}>
              Unflag
            </button>
            <button className="btn primary" onClick={p.onResolveAfterDiscussion} disabled={disabled}>
              Mark agreed (after discussion)
            </button>
          </>
        )}
      </div>

      {inDiscussion && (
        <div className="discussion">
          {cell.discussion.length === 0 && (
            <div className="muted">No comments yet.</div>
          )}
          {cell.discussion.map((d, i) => (
            <div key={i} className="entry">
              <span className="who">
                Coder {d.coder} · v{d.version} · {new Date(d.timestamp).toLocaleString()}
              </span>
              <span>{d.text}</span>
            </div>
          ))}
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add a comment (visible to both coders)"
            disabled={disabled}
          />
          <div style={{ marginTop: 6 }}>
            <button className="btn sm" disabled={!draft.trim() || disabled}
              onClick={() => {
                p.onAppendDiscussion({
                  version: p.version,
                  coder,
                  text: draft.trim(),
                  timestamp: new Date().toISOString(),
                });
                setDraft("");
              }}>
              Post comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Cell["status"] }) {
  const cls = "pill " + status;
  return <span className={cls}>{status}</span>;
}
