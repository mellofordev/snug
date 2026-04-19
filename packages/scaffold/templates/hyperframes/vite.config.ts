import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/player",
  resolve: {
    alias: {
      "@compositions": path.resolve(__dirname, "compositions"),
    },
  },
  server: {
    port: 0,
    strictPort: false,
    fs: {
      // Allow the player (rooted at src/player/) to import from ../../compositions.
      allow: [path.resolve(__dirname)],
    },
  },
});
