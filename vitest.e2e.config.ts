import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/test/e2e/**/*.test.ts", "src/test/e2e/**/*.test.tsx"],
    setupFiles: ["src/test/vitest.setup.ts", "src/test/e2e/setup.ts"],
    globals: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify("0.7.33"),
  },
});
