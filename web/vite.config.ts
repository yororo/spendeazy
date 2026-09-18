import { defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pdfParseWorkerPath = normalizePath(
  fileURLToPath(
    new URL("../web/pdf.worker.mjs", import.meta.resolve("pdf-parse")),
  ),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: pdfParseWorkerPath,
          dest: "assets",
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
