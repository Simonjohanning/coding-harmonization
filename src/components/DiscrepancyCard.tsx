import { forwardRef, useState } from "react";
import type { Cell, Coder, DiscussionEntry } from "../lib/types";
import { isKnownCode, labelOf } from "../lib/codes";

interface Props {
  cell: Cell;
  answer: string;
  coder: Coder;
  version: number;
  disabled?: boolean;
  focused?: boolean;
  onAdopt: (code: string) => void;
  onConcede: (code: string) => void;
  onFlagDiscussion: () => void;
  onUnflag: () => void;
  onResolveAfterDiscussion: () => void;
  onAppendDiscussion: (entry: DiscussionEntry) => void;
}

const DiscrepancyCard = forwardRef<HTMLDivElement, Props>(function DiscrepancyCard(p, ref) {
  const { cell, answer, coder, disabled, focused } = p;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const mine = coder === "A" ? cell.codesA : cell.codesB;
  const theirs = coder === "A" ? cell.codesB : cell.codesA;
  const shared = mine.filter(c => theirs.includes(c));
  const onlyMine = mine.filter(c => !theirs.includes(c));
  const onlyTheirs = theirs.filter(c => !mine.includes(c));
  const otherCoder: Coder = coder === "A" ? "B" : "A";
  const inDiscussion = cell.status === "discussion";

  const answerTruncated = answer.length > 240;

  return (
    <div className={"card" + (focused ? " focused" : "")} ref={ref} tabIndex={-1}>
      <div className="card-header">
        <span className={"pill tech"}>{cell.tech}</span>
        <StatusPill status={cell.status} />
        {cell.changedSinceLastVersion && (
          <span className="pill changed">
            changed since v{cell.carriedFromVersion ?? "?"}
          </span>
        )}
        <span className="id">
          {cell.rowId} <span className="muted">·</span> {cell.question}
        </span>
      </div>

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
          shared={shared}
          only={coder === "A" ? onlyMine : onlyTheirs}
          onRemove={(code) => coder === "A" ? p.onConcede(code) : p.onAdopt(code)}
          removeAction={coder === "A" ? "concede" : "adopt"}
          disabled={disabled}
        />
        <ColumnPanel
          coder="B"
          isMine={coder === "B"}
          shared={shared}
          only={coder === "B" ? onlyMine : onlyTheirs}
          onRemove={(code) => coder === "B" ? p.onConcede(code) : p.onAdopt(code)}
          removeAction={coder === "B" ? "concede" : "adopt"}
          disabled={disabled}
        />
      </div>

      {cell.harmonized && cell.harmonized.length > 0 && (
        <div className="harm-row">
          <span className="harm-label">Harmonized</span>
          {cell.harmonized.map(c => (
            <Chip key={c} code={c} variant="harm" />
          ))}
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
              Mark agreed (intersection)
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <span className="muted">You are Coder {coder} · other = {otherCoder}</span>
      </div>

      {inDiscussion && (
        <div className="discussion">
          <h5>Discussion</h5>
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
            placeholder="Add a comment (visible to both coders)…"
            disabled={disabled}
          />
          <div style={{ marginTop: 8 }}>
            <button className="btn sm primary" disabled={!draft.trim() || disabled}
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
});
export default DiscrepancyCard;

function ColumnPanel({
  coder, isMine, shared, only, onRemove, removeAction, disabled,
}: {
  coder: Coder;
  isMine: boolean;
  shared: string[];
  only: string[];
  onRemove: (code: string) => void;
  removeAction: "adopt" | "concede";
  disabled?: boolean;
}) {
  return (
    <div className={"coder-col" + (isMine ? " is-mine" : "")}>
      <h4>
        Coder {coder} {isMine && <span className="self-tag">You</span>}
      </h4>
      {shared.length === 0 && only.length === 0 && (
        <div className="empty-note">no codes assigned</div>
      )}
      {shared.map(c => <Chip key={"s" + c} code={c} variant="shared" />)}
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
