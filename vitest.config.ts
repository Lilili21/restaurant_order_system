import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
      "server-only": path.join(rootDir, "tests/mocks/server-only.ts")
    }
  },
  test: {
    environment: "node",
    fileParallelism: false,
    globals: true,
    setupFiles: ["./tests/setup.ts"]
  }
});
