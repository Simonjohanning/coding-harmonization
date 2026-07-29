import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to the local write server (dev-server.mjs).
      // In production/Netlify this proxy is irrelevant — Netlify's function
      // handles /api/commit natively.
      "/api": "http://localhost:5174",
    },
  },
});
