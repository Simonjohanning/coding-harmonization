"""
Ingest two coded xlsx files (Coder A and Coder B) into versioned JSON.

Usage:
    python ingest.py coderA.xlsx coderB.xlsx [--note "text"] [--force-new-version]

Produces:
    data/v{N}/answers.json
    data/v{N}/codings.json
    data/labels.json          (created on v1, shared across versions)
    data/log.json             (created on v1, shared across versions)
    data/manifest.json        (lists versions + current pointer)

Versioning:
    - Each run creates a new v{N} directory (N = previous + 1).
    - For each cell, if the same (rowId, tech, question) existed in v{N-1}
      AND both coders' code sets are unchanged, the harmonization,
      status, and changedSinceLastVersion=false are carried over.
    - If codes changed, the cell is reset to pending; discussion entries
      are still carried forward, tagged with their original version.
    - Refuses to ingest if all rowIds are new vs. previous version
      (unless --force-new-version).
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

# --- Config ------------------------------------------------------------------

SKIP_SHEET_PATTERNS = [re.compile(r"sinus[-_ ]?discuss", re.IGNORECASE),
                       re.compile(r"^_codes$", re.IGNORECASE)]

MAIN_PATTERN = re.compile(
    r"^\s*main\s*[-_ ]?\s*q\s*(\d+)\s*[-_ ]?\s*r\s*(\d+)\b",
    re.IGNORECASE,
)
# In the output xlsx (from formativeTransformation.py), MainQn headers become
# "Main - QNr1 | ..." (reused from the first rX). codeQn headers are "codeQn".
CODEQ_PATTERN = re.compile(r"^\s*codeQ\s*(\d+)\s*$", re.IGNORECASE)
MAINQ_ANY_PATTERN = re.compile(
    r"main\s*[-_ ]?\s*q\s*(\d+)", re.IGNORECASE
)

DATA_DIR = Path("public") / "data"


# --- Helpers -----------------------------------------------------------------

def should_skip(sheet_name):
    return any(p.search(sheet_name) for p in SKIP_SHEET_PATTERNS)


def parse_code_cell(v):
    """Comma-separated codes -> sorted unique list (case-preserved)."""
    if v is None:
        return []
    s = str(v).strip()
    if not s:
        return []
    parts = [p.strip() for p in s.split(",")]
    return sorted({p for p in parts if p})


def row_id_from(cells_a_to_k, sheet, row_num):
    """Concatenate column A (username) + column B (externalID) with '|'."""
    a = cells_a_to_k[0]
    b = cells_a_to_k[1]
    a_s = "" if a is None else str(a).strip()
    b_s = "" if b is None else str(b).strip()
    if a_s and b_s:
        return f"{a_s}|{b_s}"
    if a_s or b_s:
        return a_s or b_s
    return f"{sheet}_row{row_num}"


def extract_sheet(ws):
    """Return list of {rowId, tech, question, answer, codes} for one sheet.

    We locate MainQn/codeQn pairs in the header row, then read each data row.
    """
    if should_skip(ws.title):
        return []

    headers = [c.value for c in ws[1]]
    n = len(headers)

    # Detect MainQn columns: any header whose text matches "Main[-_ ]QNrX"
    # or where openpyxl left the header from an original file
    pairs = []  # list of (q_num, main_col_idx, code_col_idx)
    for idx, h in enumerate(headers, start=1):
        if h is None:
            continue
        s = str(h)
        m = MAIN_PATTERN.match(s) or MAINQ_ANY_PATTERN.search(s)
        if not m:
            continue
        q_num = int(m.group(1))
        # find the sibling codeQn column: next column whose header is codeQn
        code_idx = None
        for j in range(idx + 1, min(n, idx + 3) + 1):  # look up to 2 cols right
            hj = headers[j - 1]
            if hj is None:
                continue
            mj = CODEQ_PATTERN.match(str(hj))
            if mj and int(mj.group(1)) == q_num:
                code_idx = j
                break
        if code_idx is None:
            # Fallback: assume codeQn sits immediately to the right
            code_idx = idx + 1
        pairs.append((q_num, idx, code_idx))

    if not pairs:
        return []

    out = []
    for r in range(2, ws.max_row + 1):
        cells_a_to_k = [ws.cell(row=r, column=c).value for c in range(1, 12)]
        rid = row_id_from(cells_a_to_k, ws.title, r)
        # skip fully empty rows
        if not any(cells_a_to_k) and not any(
            ws.cell(row=r, column=m_idx).value or ws.cell(row=r, column=c_idx).value
            for _, m_idx, c_idx in pairs
        ):
            continue
        for q_num, m_idx, c_idx in pairs:
            answer = ws.cell(row=r, column=m_idx).value
            codes = parse_code_cell(ws.cell(row=r, column=c_idx).value)
            out.append({
                "rowId": rid,
                "tech": ws.title,
                "question": f"Q{q_num}",
                "answer": answer if answer is not None else "",
                "codes": codes,
            })
    return out


def load_file(path):
    """Return dict of {(rowId, tech, question): entry} for one coder file."""
    wb = load_workbook(path, data_only=True)
    result = {}
    answers = {}
    for name in wb.sheetnames:
        for entry in extract_sheet(wb[name]):
            key = (entry["rowId"], entry["tech"], entry["question"])
            result[key] = entry["codes"]
            answers[key] = {
                "tech": entry["tech"],
                "rowId": entry["rowId"],
                "question": entry["question"],
                "answer": entry["answer"],
            }
    return result, answers


def cell_id(rowId, tech, question):
    return f"{tech}|{rowId}|{question}"


def read_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False),
        encoding="utf-8",
    )


def next_version_number(manifest):
    if not manifest or not manifest.get("versions"):
        return 1
    return max(v["n"] for v in manifest["versions"]) + 1


# --- Ingest ------------------------------------------------------------------

def ingest(path_a, path_b, note, force_new):
    print(f"Reading {path_a} ...")
    codes_a, answers_a = load_file(path_a)
    print(f"Reading {path_b} ...")
    codes_b, answers_b = load_file(path_b)

    all_keys = sorted(set(codes_a) | set(codes_b))
    print(f"Cells: A={len(codes_a)}, B={len(codes_b)}, union={len(all_keys)}")

    # Previous version
    manifest = read_json(DATA_DIR / "manifest.json") or {"current": 0, "versions": []}
    prev_n = manifest.get("current", 0) or 0
    prev_codings = None
    if prev_n:
        prev_codings = read_json(DATA_DIR / f"v{prev_n}" / "codings.json")

    # New-rowid safeguard
    if prev_codings and not force_new:
        prev_rowids = {c["rowId"] for c in prev_codings["cells"]}
        new_rowids = {k[0] for k in all_keys}
        if prev_rowids and new_rowids.isdisjoint(prev_rowids):
            print("ERROR: all rowIds are new vs. previous version. "
                  "Refusing to ingest (probable file mixup). "
                  "Rerun with --force-new-version to override.",
                  file=sys.stderr)
            sys.exit(2)

    prev_index = {}
    if prev_codings:
        for c in prev_codings["cells"]:
            prev_index[cell_id(c["rowId"], c["tech"], c["question"])] = c

    new_n = next_version_number(manifest)
    print(f"Creating version v{new_n}...")

    cells = []
    stats = {"carried": 0, "reset": 0, "auto": 0, "pending_new": 0}

    for key in all_keys:
        rid, tech, q = key
        ca = codes_a.get(key, [])
        cb = codes_b.get(key, [])
        cid = cell_id(rid, tech, q)
        prev = prev_index.get(cid)

        # Carry discussion always, tagged with origin version
        discussion = []
        if prev:
            for d in prev.get("discussion", []):
                # If it already has a version, keep as-is
                if "version" not in d:
                    d = {**d, "version": prev_n}
                discussion.append(d)

        # Determine status/harmonization
        codes_unchanged = (
            prev is not None
            and prev.get("codesA", []) == ca
            and prev.get("codesB", []) == cb
        )

        if ca == cb:
            # No discrepancy — auto-resolved
            status = "auto"
            harmonized = list(ca)
            changed = False
            if prev and codes_unchanged and prev.get("status") in {"auto", "resolved"}:
                stats["carried"] += 1
            else:
                stats["auto"] += 1
        elif prev and codes_unchanged:
            # Carry the previous decision (including in-discussion state)
            status = prev.get("status", "pending")
            harmonized = prev.get("harmonized")
            changed = False
            stats["carried"] += 1
        else:
            status = "pending"
            harmonized = None
            changed = prev is not None  # existed before but codes changed
            if changed:
                stats["reset"] += 1
            else:
                stats["pending_new"] += 1

        cells.append({
            "cellId": cid,
            "rowId": rid,
            "tech": tech,
            "question": q,
            "codesA": ca,
            "codesB": cb,
            "harmonized": harmonized,
            "status": status,
            "discussion": discussion,
            "changedSinceLastVersion": changed,
            "carriedFromVersion": prev_n if (prev and codes_unchanged) else None,
        })

    # Answers file — merge A & B (they should agree; A wins on conflicts)
    answers_out = []
    seen = set()
    for key in all_keys:
        src = answers_a.get(key) or answers_b.get(key)
        if not src:
            continue
        cid = cell_id(*key)
        if cid in seen:
            continue
        seen.add(cid)
        answers_out.append({"cellId": cid, **src})

    # Write version files
    vdir = DATA_DIR / f"v{new_n}"
    write_json(vdir / "answers.json", {"version": new_n, "cells": answers_out})
    write_json(vdir / "codings.json", {"version": new_n, "cells": cells})

    # Shared labels + log (only create on v1)
    if not (DATA_DIR / "labels.json").exists():
        write_json(DATA_DIR / "labels.json", {})
    if not (DATA_DIR / "log.json").exists():
        write_json(DATA_DIR / "log.json", {"entries": []})

    # Update manifest
    now = datetime.now(timezone.utc).isoformat()
    manifest["versions"].append({"n": new_n, "created": now, "note": note or ""})
    manifest["current"] = new_n
    write_json(DATA_DIR / "manifest.json", manifest)

    print(f"Wrote {vdir}/")
    print(f"Stats: {stats}")
    print(f"Manifest -> current = v{new_n}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("coder_a", type=Path, help="Coder A xlsx (output of formativeTransformation.py, coded)")
    ap.add_argument("coder_b", type=Path, help="Coder B xlsx")
    ap.add_argument("--note", default="", help="Optional note stored in manifest")
    ap.add_argument("--force-new-version", action="store_true",
                    help="Ingest even if all rowIds are new vs. previous version")
    args = ap.parse_args()

    if not args.coder_a.exists() or not args.coder_b.exists():
        print("Input file not found", file=sys.stderr)
        sys.exit(1)

    ingest(args.coder_a, args.coder_b, args.note, args.force_new_version)


if __name__ == "__main__":
    main()
