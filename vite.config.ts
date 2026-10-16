import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  define: {
    // Library builds don't replace NODE_ENV automatically. Without this React ships its
    // development build (~3x larger, slower) inside the dealer-site embed.
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV === "development" ? "development" : "production"),
    "process.env": "{}",
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
      // Vendor-neutral public filename for Dial Us Now / tenant CDNs.
      fileName: "assistant-widget",
      formats: ["iife"],
    },
    target: "es2019",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: true,
  },
});
