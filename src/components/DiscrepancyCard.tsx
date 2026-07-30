import { forwardRef, useEffect, useState } from "react";
import type { Cell, Coder, DiscussionEntry } from "../lib/types";
import { isKnownCode, labelOf } from "../lib/codes";
import { labelOfQuestion } from "../lib/questions";

interface Props {
  cell: Cell;
  answer: string;
  coder: Coder;
  version: number;
  disabled?: boolean;
  focused?: boolean;
  onAdopt: (code: string) => void;
  onConcede: (code: string) => void;
  onFlagDiscussion: (initialComment?: string) => void;
  onUnflag: () => void;
  onAppendDiscussion: (entry: DiscussionEntry) => void;
}

// Draft persistence: survives polling refetches, filter switches, and refresh.
const DRAFT_KEY = (cellId: string) => `harm_draft_${cellId}`;

function loadDraft(cellId: string): string {
  try { return localStorage.getItem(DRAFT_KEY(cellId)) || ""; }
  catch { return ""; }
}
function saveDraft(cellId: string, text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY(cellId), text);
    else localStorage.removeItem(DRAFT_KEY(cellId));
  } catch { /* ignore quota */ }
}

const DiscrepancyCard = forwardRef<HTMLDivElement, Props>(function DiscrepancyCard(p, ref) {
  const { cell, answer, coder, disabled, focused } = p;
  const [expanded, setExpanded] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [draft, setDraft] = useState<string>(() => loadDraft(cell.cellId));

  // Persist draft on every keystroke
  useEffect(() => { saveDraft(cell.cellId, draft); }, [cell.cellId, draft]);

  // If the cell id changes (component reused for a different cell), reload
  useEffect(() => { setDraft(loadDraft(cell.cellId)); }, [cell.cellId]);

  const mine = coder === "A" ? cell.codesA : cell.codesB;
  const theirs = coder === "A" ? cell.codesB : cell.codesA;
  const shared = mine.filter(c => theirs.includes(c));
  const onlyMine = mine.filter(c => !theirs.includes(c));
  const onlyTheirs = theirs.filter(c => !mine.includes(c));
  const otherCoder: Coder = coder === "A" ? "B" : "A";
  const inDiscussion = cell.status === "discussion";
  const isPending = cell.status === "pending";

  const answerTruncated = answer.length > 240;
  const sharedTooltip = shared
    .map(c => c + (labelOf(c) ? "  " + labelOf(c) : ""))
    .join("\n");

  function submitFlag() {
    const text = draft.trim();
    p.onFlagDiscussion(text || undefined);
    if (text) {
      setDraft("");
      saveDraft(cell.cellId, "");
    }
  }

  function submitComment() {
    const text = draft.trim();
    if (!text) return;
    p.onAppendDiscussion({
      version: p.version,
      coder,
      text,
      timestamp: new Date().toISOString(),
    });
    setDraft("");
    saveDraft(cell.cellId, "");
  }

  return (
    <div className={"card" + (focused ? " focused" : "")} ref={ref} tabIndex={-1}>
      <div className="card-header">
        <span className="pill tech">{cell.tech}</span>
        <StatusPill status={cell.status} />
        {cell.changedSinceLastVersion && (
          <span className="pill changed">
            changed since v{cell.carriedFromVersion ?? "?"}
          </span>
        )}
        <span className="id">
          {cell.rowId} <span className="muted">·</span> {cell.question}
          {labelOfQuestion(cell.question) && (
            <span className="q-label"> — {labelOfQuestion(cell.question)}</span>
          )}
        </span>
        <span style={{ flex: 1 }} />
        {shared.length > 0 && (
          <button
            className="shared-badge"
            onClick={() => setSharedOpen(x => !x)}
            title={sharedTooltip}
          >
            {sharedOpen ? "▾" : "▸"} {shared.length} shared
          </button>
        )}
      </div>

      {sharedOpen && shared.length > 0 && (
        <div className="shared-strip">
          {shared.map(c => <Chip key={c} code={c} variant="shared" />)}
        </div>
      )}

      <div className={"answer" + (answerTruncated && !expanded ? " collapsed" : "")}>
        {answer || <span className="muted">(empty answer)</span>}
      </div>
      {answerTruncated && (
        <button className="expand-btn" onClick={() => setExpanded(x => !x)}>
          {expanded ? "Collapse" : "Expand answer"}
        </button>
      )}

      <div className="coder-cols">
        <ColumnPanel
          coder="A"
          isMine={coder === "A"}
          only={coder === "A" ? onlyMine : onlyTheirs}
          allShared={shared.length}
          onRemove={(code) => coder === "A" ? p.onConcede(code) : p.onAdopt(code)}
          removeAction={coder === "A" ? "concede" : "adopt"}
          disabled={disabled}
        />
        <ColumnPanel
          coder="B"
          isMine={coder === "B"}
          only={coder === "B" ? onlyMine : onlyTheirs}
          allShared={shared.length}
          onRemove={(code) => coder === "B" ? p.onConcede(code) : p.onAdopt(code)}
          removeAction={coder === "B" ? "concede" : "adopt"}
          disabled={disabled}
        />
      </div>

      {cell.harmonized && cell.harmonized.length > 0 && (
        <div className="harm-row">
          <span className="harm-label">Harmonized</span>
          {cell.harmonized.map(c => <Chip key={c} code={c} variant="harm" />)}
        </div>
      )}

      <div className="row-actions">
        {isPending && (
          <button className="btn warn" onClick={submitFlag} disabled={disabled}>
            {draft.trim() ? "Flag with comment" : "Flag for discussion"}
          </button>
        )}
        {inDiscussion && (
          <button className="btn" onClick={p.onUnflag} disabled={disabled}>
            Unflag (back to pending)
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span className="muted">You are Coder {coder} · other = {otherCoder}</span>
      </div>

      {(isPending || inDiscussion) && (
        <div className="discussion">
          <h5>
            {inDiscussion ? "Discussion" : "Initial comment (optional)"}
            {cell.discussion.length > 0 && (
              <span className="muted" style={{ marginLeft: 8, fontSize: 11, textTransform: "none" }}>
                — {cell.discussion.length} comment{cell.discussion.length === 1 ? "" : "s"}
              </span>
            )}
          </h5>
          {inDiscussion && cell.discussion.length === 0 && (
            <div className="muted">No comments yet.</div>
          )}
          {inDiscussion && cell.discussion.map((d, i) => (
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
            placeholder={inDiscussion
              ? "Add a comment (visible to both coders)…"
              : "Type an initial comment then click Flag with comment…"}
            disabled={disabled}
          />
          {inDiscussion && (
            <div style={{ marginTop: 8 }}>
              <button className="btn sm primary" disabled={!draft.trim() || disabled}
                onClick={submitComment}>
                Post comment
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
export default DiscrepancyCard;

function ColumnPanel({
  coder, isMine, only, allShared, onRemove, removeAction, disabled,
}: {
  coder: Coder;
  isMine: boolean;
  only: string[];
  allShared: number;
  onRemove: (code: string) => void;
  removeAction: "adopt" | "concede";
  disabled?: boolean;
}) {
  return (
    <div className={"coder-col" + (isMine ? " is-mine" : "")}>
      <h4>
        Coder {coder} {isMine && <span className="self-tag">You</span>}
      </h4>
      {only.length === 0 && allShared === 0 && (
        <div className="empty-note">no codes assigned</div>
      )}
      {only.length === 0 && allShared > 0 && (
        <div className="empty-note">no unique codes (all shared)</div>
      )}
      {only.map(c => (
        <Chip
          key={"o" + c}
          code={c}
          variant={isMine ? "only-mine" : "only-theirs"}
          onRemove={disabled ? undefined : () => onRemove(c)}
          removeTitle={removeAction === "concede"
            ? "Concede — remove from your codes"
            : "Adopt — add to your codes"}
          removeSymbol={removeAction === "concede" ? "×" : "+"}
        />
      ))}
    </div>
  );
}

function Chip({
  code, variant, onRemove, removeTitle, removeSymbol,
}: {
  code: string;
  variant: "shared" | "only-mine" | "only-theirs" | "harm";
  onRemove?: () => void;
  removeTitle?: string;
  removeSymbol?: string;
}) {
  const label = labelOf(code);
  const known = isKnownCode(code);
  return (
    <span className={"chip " + variant + (known ? "" : " unknown")} title={label}>
      <span className="code">{code}</span>
      {label && <span className="label">{label}</span>}
      {onRemove && (
        <button className="action" onClick={onRemove} title={removeTitle}>
          {removeSymbol}
        </button>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: Cell["status"] }) {
  return <span className={"pill " + status}>{status}</span>;
}
