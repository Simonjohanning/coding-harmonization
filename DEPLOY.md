# Subcoding — final reviewed bundle

Built and verified against the actual main branch (cloned 2026-08-18).
`npm run build` passes. Transform logic tested against real v6 data.

## File map (all full replacements — overwrite each)

| bundle file          | repo path                            | status   |
|----------------------|--------------------------------------|----------|
| types.ts             | src/lib/types.ts                     | modified |
| data.ts              | src/lib/data.ts                      | modified |
| App.tsx              | src/App.tsx                          | modified |
| Frequency.tsx        | src/routes/Frequency.tsx             | modified |
| DiscrepancyCard.tsx  | src/components/DiscrepancyCard.tsx   | modified |
| styles.css           | src/styles.css                       | modified |
| Subcoding.tsx        | src/routes/Subcoding.tsx             | NEW      |
| SubcodingCard.tsx    | src/components/SubcodingCard.tsx     | NEW      |

Commit all 8 in one commit (github.dev: press "." on the repo,
paste files, single commit). Netlify deploys automatically.

## Review fixes included (vs. the previous two patch zips)

1. data.ts no longer breaks the main build (removed the import.meta.env
   dependency that main lacks types for; password behavior unchanged).
2. Subcode-ID collision guard: subcoding PBC1 will NOT suggest PBC11/12/13
   (canonical codes); wizard + add both validate against the codebook.
3. "Unresolve" button on resolved subcoding cells — reopens the cell AND
   restores the parent code in codings.json (removes the subcodes).
4. "Sync N new cell(s)" button appears when Reconcile has resolved more
   cells with the parent after the subcoding pass started.
5. Subcodes in the harmonized row on Reconcile no longer render red
   ("unknown" styling now only flags typos in coder columns).
6. Frequency: subcode labels load from the subcoding files automatically;
   "Hide subcoded parents" checkbox; Refine button shows "Refining…" for
   parents with an active pass.

## Known limitations (unchanged)

- No polling/conflict sync on the Subcoding page — don't subcode the same
  parent from two browsers at once. Coordinate like you do for ingest.
- Registry/manifest writes are best-effort; if one fails the subcoding
  file itself is still the source of truth.
- Reconcile's Sort issue from earlier is untouched (separate bug, still
  needs the console repro).
