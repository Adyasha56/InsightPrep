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
      CRAWLER_MAX_PAGES: "4",
      CRAWLER_MAX_DEPTH: "2",
      CRAWLER_MAX_RESPONSE_BYTES: "2000000",
      CRAWLER_TIMEOUT_MS: "300",
      CRAWLER_MAX_RETRIES: "2",
      CRAWLER_REQUEST_DELAY_MS: "0",
      // "true" here only lets kit-generation integration tests target a
      // fake local test domain without a real DNS round trip; SSRF
      // enforcement itself is tested directly against explicit options in
      // tests/unit/url-validation.service.test.ts, independent of this flag.
      ALLOW_LOCAL_RESEARCH_TARGETS: "true",
      GEMINI_API_KEY: "test-fake-gemini-key",
      GEMINI_MODEL: "gemini-3.5-flash",
      GEMINI_TIMEOUT_MS: "1000",
      GEMINI_MAX_RETRIES: "1",
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
