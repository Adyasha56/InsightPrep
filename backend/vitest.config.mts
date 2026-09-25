import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Set before any module (including src/config/env.ts) loads, so the
    // zod-validated config always has what it needs during tests.
    env: {
      NODE_ENV: "test",
      PORT: "5099",
      JWT_SECRET: "test-only-secret-key-please-ignore",
      JWT_EXPIRES_IN: "1h",
      MONGODB_URI: "mongodb://127.0.0.1:27418/insightprep_test",
      CORS_ORIGIN: "http://localhost:3000",
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
