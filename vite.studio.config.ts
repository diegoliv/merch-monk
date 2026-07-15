import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    {
      name: "copy-studio-model",
      closeBundle() {
        mkdirSync(resolve("studio-dist/models"), { recursive: true });
        copyFileSync(resolve("public/models/merch_monk_website.glb"), resolve("studio-dist/models/merch_monk_website.glb"));
      },
    },
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
  },
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: "studio-dist",
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "studio.css";
          return "assets/[name][extname]";
        },
        entryFileNames: "merch-monk-studio.js",
      },
    },
    lib: {
      entry: "src/studio.tsx",
      formats: ["es"],
      fileName: () => "merch-monk-studio.js",
    },
  },
});
