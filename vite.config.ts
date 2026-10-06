/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages PROJECT site: https://ginyuspecialforce.github.io/FlyPhysicsC/
  // — served under /<repo>/, so the base must match (case included). The
  // GitHub Actions workflow builds with this config, and every runtime path
  // in the app goes through import.meta.env.BASE_URL, so this one line is
  // the only thing that has to change between a project site and a user site.
  // Vite dev serves under the same path (root redirects there).
  base: "/FlyPhysicsC/",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          postprocessing: ["postprocessing"],
        },
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
