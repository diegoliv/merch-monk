import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: "webflow-dist",
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "style.css";
          return "assets/[name][extname]";
        },
        entryFileNames: "merch-monk-webflow.js",
      },
    },
    lib: {
      entry: "src/webflow.tsx",
      formats: ["es"],
      fileName: () => "merch-monk-webflow.js",
    },
  },
});

