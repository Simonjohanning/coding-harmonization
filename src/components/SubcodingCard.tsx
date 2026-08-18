import { forwardRef, useEffect, useState } from "react";
import type { Coder, DiscussionEntry, Subcode, SubcodingCell } from "../lib/types";

interface Props {
  cell: SubcodingCell;
  answer: string;
  coder: Coder;
  version: number;
  minorVersion: number;
  parent: string;
  subcodes: Subcode[];
  disabled?: boolean;
  focused?: boolean;
  onToggleMine: (id: string) => void;
  onAdopt: (id: string) => void;
  onConcede: (id: string) => void;
  onAddBoth: (id: string) => void;
  onFlagDiscussion: (comment?: string) => void;
  onUnflag: () => void;
  onUnresolve: () => void;
  onAppendDiscussion: (entry: DiscussionEntry) => void;
}

const DRAFT_KEY = (cellId: string, parent: string) => `subharm_draft_${parent}_${cellId}`;

function loadDraft(cellId: string, parent: string): string {
  try { return localStorage.getItem(DRAFT_KEY(cellId, parent)) || ""; } catch { return ""; }
}
function saveDraft(cellId: string, parent: string, text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY(cellId, parent), text);
    else localStorage.removeItem(DRAFT_KEY(cellId, parent));
  } catch { /* ignore quota */ }
}

const SubcodingCard = forwardRef<HTMLDivElement, Props>(function SubcodingCard(p, ref) {
  const { cell, answer, coder, disabled, focused, subcodes, parent } = p;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string>(() => loadDraft(cell.cellId, parent));

  useEffect(() => { saveDraft(cell.cellId, parent, draft); }, [cell.cellId, parent, draft]);
  useEffect(() => { setDraft(loadDraft(cell.cellId, parent)); }, [cell.cellId, parent]);

  const mine = coder === "A" ? cell.codesA : cell.codesB;
  const theirs = coder === "A" ? cell.codesB : cell.codesA;
  const shared = mine.filter(x => theirs.includes(x));
  const onlyMine = mine.filter(x => !theirs.includes(x));
  const onlyTheirs = theirs.filter(x => !mine.includes(x));
  const inDiscussion = cell.status === "discussion";
  const isPending = cell.status === "pending";
  const isResolved = cell.status === "resolved";

  const answerTruncated = answer.length > 240;

  function submitFlag() {
    const text = draft.trim();
    p.onFlagDiscussion(text || undefined);
    if (text) { setDraft(""); saveDraft(cell.cellId, parent, ""); }
  }

  function submitComment() {
    const text = draft.trim();
    if (!text) return;
    p.onAppendDiscussion({
      version: p.version, coder, text,
      timestamp: new Date().toISOString(),
    });
    setDraft(""); saveDraft(cell.cellId, parent, "");
  }

  function handleCommentKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isPending) submitFlag();
      else if (inDiscussion) submitComment();
    }
  }

  const subcodeLabel = (id: string) => subcodes.find(s => s.id === id)?.label ?? "";

  return (
    <div className={"card" + (focused ? " focused" : "")} ref={ref} tabIndex={-1}>
      <div className="card-header">
        <span className="pill tech">{cell.tech}</span>
        <span className={"pill " + cell.status}>{cell.status}</span>
        <span className="id">
          {cell.rowId} <span className="muted">·</span> {cell.question}
        </span>
        <span style={{ flex: 1 }} />
      </div>

      <div className={"answer" + (answerTruncated && !expanded ? " collapsed" : "")}>
        {answer || <span className="muted">(empty answer)</span>}
      </div>
      {answerTruncated && (
        <button className="expand-btn" onClick={() => setExpanded(x => !x)}>
          {expanded ? "Collapse" : "Expand answer"}
        </button>
      )}

      {shared.length > 0 && (
        <div className="harm-row">
          <span className="harm-label">Shared</span>
          {shared.map(id => (
            <span key={id} className="chip shared">
              <span className="code">{id}</span>
              {subcodeLabel(id) && <span className="label">{subcodeLabel(id)}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="coder-cols">
        <ColumnPanel
          coder="A"
          isMine={coder === "A"}
          only={coder === "A" ? onlyMine : onlyTheirs}
          allShared={shared.length}
          subcodes={subcodes}
          onRemove={(id) => coder === "A" ? p.onConcede(id) : p.onAdopt(id)}
          removeAction={coder === "A" ? "concede" : "adopt"}
          disabled={disabled}
        />
        <ColumnPanel
          coder="B"
          isMine={coder === "B"}
          only={coder === "B" ? onlyMine : onlyTheirs}
          allShared={shared.length}
          subcodes={subcodes}
          onRemove={(id) => coder === "B" ? p.onConcede(id) : p.onAdopt(id)}
          removeAction={coder === "B" ? "concede" : "adopt"}
          disabled={disabled}
        />
      </div>

      {!isResolved && subcodes.length > 0 && (
        <div className="subcode-picker">
          <span className="propose-label">Pick / propose a subcode:</span>
          {subcodes.map(s => {
            const inMine = mine.includes(s.id);
            const inTheirs = theirs.includes(s.id);
            const inBoth = inMine && inTheirs;
            return (
              <span key={s.id} className={"subcode-pick" + (inMine ? " selected" : "")}>
                <button
                  className="pick-code"
                  onClick={() => p.onToggleMine(s.id)}
                  disabled={disabled}
                  title={inMine ? "Remove from your picks" : "Add to your picks"}
                >
                  {inMine ? "✓ " : ""}{s.id} {s.label && <span className="muted">— {s.label}</span>}
                </button>
                {inDiscussion && !inBoth && (
                  <button
                    className="btn sm"
                    onClick={() => p.onAddBoth(s.id)}
                    disabled={disabled}
                    title="Apply to both coders (agreed during discussion)"
                  >
                    both
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {cell.harmonized && cell.harmonized.length > 0 && (
        <div className="harm-row">
          <span className="harm-label">Harmonized</span>
          {cell.harmonized.map(id => (
            <span key={id} className="chip harm">
              <span className="code">{id}</span>
              {subcodeLabel(id) && <span className="label">{subcodeLabel(id)}</span>}
            </span>
          ))}
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
        {isResolved && (
          <button className="btn" onClick={p.onUnresolve} disabled={disabled}
            title="Reopen this cell: restores the parent code in the main data and clears the agreed subcodes">
            Unresolve
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span className="muted">You are Coder {coder}</span>
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
            onKeyDown={handleCommentKey}
            placeholder={inDiscussion
              ? "Add a comment (Ctrl+Enter to submit)…"
              : "Initial comment then Flag with comment (Ctrl+Enter to submit)…"}
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
export default SubcodingCard;

function ColumnPanel({
  coder, isMine, only, allShared, subcodes, onRemove, removeAction, disabled,
}: {
  coder: Coder;
  isMine: boolean;
  only: string[];
  allShared: number;
  subcodes: Subcode[];
  onRemove: (id: string) => void;
  removeAction: "adopt" | "concede";
  disabled?: boolean;
}) {
  const label = (id: string) => subcodes.find(s => s.id === id)?.label ?? "";
  return (
    <div className={"coder-col" + (isMine ? " is-mine" : "")}>
      <h4>
        Coder {coder} {isMine && <span className="self-tag">You</span>}
      </h4>
      {only.length === 0 && allShared === 0 && (
        <div className="empty-note">no subcodes picked</div>
      )}
      {only.length === 0 && allShared > 0 && (
        <div className="empty-note">no unique picks (all shared)</div>
      )}
      {only.map(id => (
        <span
          key={id}
          className={"chip " + (isMine ? "only-mine" : "only-theirs")}
          title={label(id)}
        >
          <span className="code">{id}</span>
          {label(id) && <span className="label">{label(id)}</span>}
          {!disabled && (
            <button className="action" onClick={() => onRemove(id)}
              title={removeAction === "concede" ? "Concede — remove from your picks" : "Adopt — add to your picks"}>
              {removeAction === "concede" ? "×" : "+"}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
