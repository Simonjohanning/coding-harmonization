// Local write endpoint for offline mode.
// Accepts POST /api/commit and writes JSON to public/data/<path> on disk.
// No password check — this is your local machine.
//
// Run alongside `vite`:  npm run dev-offline
// Or standalone:         node dev-server.mjs

import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PORT = 5174;
const ROOT = resolve(".");
const DATA_ROOT = resolve(ROOT, "public/data");

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/commit") {
    res.writeHead(404); res.end("Not found"); return;
  }

  let body = "";
  req.on("data", chunk => (body += chunk));
  req.on("end", async () => {
    try {
      const { path, content } = JSON.parse(body);
      if (!path || typeof path !== "string" || !path.startsWith("public/data/")) {
        res.writeHead(400); res.end("Path must be under public/data/"); return;
      }
      const abs = resolve(ROOT, path);
      if (!abs.startsWith(DATA_ROOT)) {
        res.writeHead(400); res.end("Path escapes public/data/"); return;
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, JSON.stringify(content, null, 2), "utf-8");
      const rel = abs.slice(ROOT.length + 1).replace(/\\/g, "/");
      console.log(`  wrote ${rel}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: rel }));
    } catch (e) {
      console.error(e);
      res.writeHead(500); res.end(String(e));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[dev-server] listening on http://localhost:${PORT}`);
  console.log(`[dev-server] writing under ${DATA_ROOT}`);
});
