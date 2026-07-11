/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  define: {
    "process.env": {}, // <-- fixes "process is not defined"
  },

  server: {
    port: 5173,
    strictPort: false,
  },

  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },

  build: {
    lib: {
      entry: "src/embed.tsx",
      // Must NOT be "AMQUR" — Vite assigns `var <name> = …` and would overwrite
      // window.AMQUR that embed.tsx sets with { init, destroy, isReady }.
      name: "AmqurWidgetBundle",
      fileName: "amqur-widget",
      formats: ["iife"],
    },
  },
});
