import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API_BASE_URL is baked in at build time so the packaged Android app (which
// has no localhost of its own) knows where the backend lives. Set it via
// the VITE_API_BASE_URL env var when running `npm run build`.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_PROXY || "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
