/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages project site: serve from /fly-physics-c/
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
