import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Required for Electron loadFile(file://): absolute /assets/... URLs break in production.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: Number(process.env.ELECTRON_RENDERER_PORT ?? 5173),
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
