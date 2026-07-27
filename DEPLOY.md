# Deploy instructions

Full path from zero to a working Netlify deployment. Assumes you have a GitHub account and a Netlify account (both free).

## 1. Local prerequisites

- Node.js 20+ (`node --version`)
- Python 3.10+ with `openpyxl` (`pip install openpyxl`)
- `git`

## 2. Unpack and initialise

```bash
unzip coding-harmonization.zip
cd coding-harmonization
npm install
```

## 3. Create the GitHub repository

1. On GitHub, create a new **private** repo (name: e.g. `coding-harmonization`). Don't initialise it with README or gitignore.
2. Link it locally and push:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/coding-harmonization.git
git push -u origin main
```

## 4. Create a GitHub Personal Access Token (PAT)

The Netlify function needs this to commit JSON back to the repo.

1. GitHub → Settings (top-right avatar) → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Set:
   - **Repository access**: Only select repositories → pick `coding-harmonization`
   - **Repository permissions**: **Contents: Read and write**
   - **Expiration**: 90 days (or longer if you don't want to rotate soon)
3. Generate, and copy the token (starts with `github_pat_...`). You won't see it again.

## 5. Deploy to Netlify

1. Netlify → **Add new site** → Import from Git → GitHub → pick `coding-harmonization`.
2. Build settings should auto-detect from `netlify.toml`. If not:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. Click **Deploy site**. First build will take ~1 minute.

## 6. Set Netlify environment variables

Site → **Site configuration** → **Environment variables** → Add:

| Key               | Value                                             |
|-------------------|---------------------------------------------------|
| `SHARED_PASSWORD` | Any string. Both coders enter this on landing.    |
| `GITHUB_TOKEN`    | The PAT from step 4                               |
| `GITHUB_REPO`     | `owner/name` (e.g. `simonj/coding-harmonization`) |
| `GITHUB_BRANCH`   | `main`                                            |

After adding them, **Deploys → Trigger deploy → Deploy site** so the function picks them up.

## 7. First ingest

Locally, with the two coded xlsx files:

```bash
python ingest.py coderA.xlsx coderB.xlsx --note "initial coding"
git add public/data
git commit -m "ingest v1"
git push
```

Netlify auto-builds on the push. After ~1 minute the site shows the data.

## 8. Distribute to coders

Send both coders:
- The Netlify URL (e.g. `https://<sitename>.netlify.app`)
- The `SHARED_PASSWORD`

They open the URL, pick their name (A or B), paste the password, and start reconciling.

## 9. Re-ingest for later rounds

When you have updated xlsx files (usually with new respondents added):

```bash
python ingest.py coderA_v2.xlsx coderB_v2.xlsx --note "added N respondents"
git add public/data
git commit -m "ingest v2"
git push
```

The manifest's `current` pointer moves to `v2`. Prior versions stay accessible via the dropdown in the top bar (read-only). Harmonization decisions for unchanged cells carry over; changed cells reset to pending and are filterable via "Changed since previous version only".

## Troubleshooting

- **"Failed to fetch manifest.json"**: `public/data/manifest.json` doesn't exist yet. Run the ingest and push before opening the site.
- **"Bad password" on any action**: PAT expired, or `SHARED_PASSWORD` mismatch, or coders pasted with a trailing space. They can sign out (top-right) and re-enter.
- **409 conflict on save**: two coders acted simultaneously. The UI says "reload"; do that.
- **"all rowIds are new" refusal on re-ingest**: the safeguard against dataset mixups. If it's a legitimate case (e.g. IDs were re-encoded upstream), rerun with `--force-new-version`.
- **Rate limits**: the GitHub REST API allows 5000 requests/hour per token. Way beyond what two coders will hit.

## Local development (optional)

```bash
npm install -g netlify-cli
netlify link           # link this dir to the Netlify site
netlify dev            # serves the app + function at localhost:8888
```

`netlify dev` picks up your env vars from Netlify automatically.
