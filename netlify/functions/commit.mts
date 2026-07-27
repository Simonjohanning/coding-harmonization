// Netlify Function: POST /api/commit
// Body: { path: string, content: object, message: string, coder: string, password: string, expectedSha?: string }
// Env vars needed on Netlify:
//   SHARED_PASSWORD  — the password both coders paste on landing
//   GITHUB_TOKEN     — PAT with contents:write on the repo
//   GITHUB_REPO      — "owner/name"
//   GITHUB_BRANCH    — usually "main"

import type { Context } from "@netlify/functions";

const GITHUB_API = "https://api.github.com";

interface CommitBody {
  path: string;
  content: unknown;
  message: string;
  coder: string;
  password: string;
  expectedSha?: string;
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const {
    SHARED_PASSWORD,
    GITHUB_TOKEN,
    GITHUB_REPO,
    GITHUB_BRANCH = "main",
  } = process.env;

  if (!SHARED_PASSWORD || !GITHUB_TOKEN || !GITHUB_REPO) {
    return new Response("Server not configured", { status: 500 });
  }

  let body: CommitBody;
  try {
    body = (await req.json()) as CommitBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (body.password !== SHARED_PASSWORD) {
    return new Response("Bad password", { status: 401 });
  }
  if (!body.path || !body.path.startsWith("public/data/")) {
    return new Response("Path must be under public/data/", { status: 400 });
  }

  const token = GITHUB_TOKEN;
  const repo = GITHUB_REPO;
  const branch = GITHUB_BRANCH;

  // 1) Get current SHA (if file exists)
  const getUrl = `${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(body.path)}?ref=${branch}`;
  const headHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const head = await fetch(getUrl, { headers: headHeaders });
  let currentSha: string | undefined;
  if (head.status === 200) {
    const j = (await head.json()) as { sha: string };
    currentSha = j.sha;
  } else if (head.status !== 404) {
    return new Response(`GitHub error (head): ${head.status}`, { status: 502 });
  }

  // 2) Optimistic concurrency check
  if (body.expectedSha !== undefined && body.expectedSha !== currentSha) {
    return new Response(
      JSON.stringify({ error: "conflict", currentSha }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3) Put the new content
  const contentB64 = Buffer.from(
    JSON.stringify(body.content, null, 2),
    "utf-8"
  ).toString("base64");

  const putBody: Record<string, unknown> = {
    message: `${body.message} [${body.coder}]`,
    content: contentB64,
    branch,
    committer: { name: `Coder ${body.coder}`, email: `coder-${body.coder}@example.invalid` },
  };
  if (currentSha) putBody.sha = currentSha;

  const put = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(body.path)}`, {
    method: "PUT",
    headers: { ...headHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(putBody),
  });
  if (!put.ok) {
    const text = await put.text();
    return new Response(`GitHub error (put): ${put.status} ${text}`, { status: 502 });
  }

  const putJson = (await put.json()) as { content: { sha: string } };
  return new Response(
    JSON.stringify({ ok: true, newSha: putJson.content.sha }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const config = { path: "/api/commit" };
