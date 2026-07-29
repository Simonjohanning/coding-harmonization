# Offline mode

This branch (`offline`) adds a local write endpoint so you can work without internet. On `main`, writes commit through the Netlify function to GitHub; here, writes go to `public/data/` on disk. When you're back online, `git push` puts your session up.

## Requirements

Node.js 18+, `npm install`.

## Running

```powershell
npm install                # once, per machine
npm run dev-offline        # starts Vite + local write server together
```

Open http://localhost:5173. Pick your coder, leave the password blank ("dev" is used internally), reconcile normally. Every action writes to `public/data/…` on your disk.

Verify writes are landing: the `[dev-server]` terminal window logs `wrote public/data/…` per action.

## Sync workflow

**Before going offline** (grab latest state from main):
```powershell
git checkout offline
git merge main
```
Fast-forward if nobody else touched the offline branch.

**Working offline**: use `npm run dev-offline`, reconcile as usual, git-commit locally when you want checkpoints:
```powershell
git add public/data
git commit -m "offline session — reconciled 15 cells"
```

**Back online**: merge into main and push:
```powershell
git checkout main
git merge offline
git push
```
Netlify redeploys. Your offline session is now live.

## Conflicts

If the other coder was working online while you were offline and touched the same cells, `git merge` reports a conflict in `codings.json`. Open the file, pick per-cell whose version wins, then `git add` + `git commit` to finish the merge.

Rare unless both of you work heavily in parallel. Slack coordination ("I'll do fernwärme this weekend, you take biomass") prevents it entirely.

## Version numbering

**Only re-run `ingest.py` on `main`**, not the offline branch. Ingest creates a new v{N} folder and bumps the manifest — if you do that offline and someone else does it online, you both create the same version number with different content. Rule: ingest online, reconcile in either.

## What's on this branch vs. main

Five files changed:

- `dev-server.mjs` (new) — local write endpoint on port 5174
- `vite.config.ts` — proxies `/api/*` to the dev server
- `package.json` — adds `concurrently` dep and the `dev-offline` script
- `src/lib/data.ts` — allows blank password when running in dev mode
- `src/App.tsx` — landing page shows "Local dev mode" notice

The Netlify function, ingest script, and React app logic are unchanged. `main` fixes merge into `offline` cleanly.
