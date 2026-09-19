import baseConfig from "../vite.config.ts";
import { fileURLToPath } from "node:url";

export default {
  ...baseConfig,
  root: fileURLToPath(new URL(".", import.meta.url)),
};
