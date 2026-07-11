import { defineConfig } from "vite";
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
