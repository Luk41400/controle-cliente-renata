import { defineConfig } from "@playwright/test";

const port = 3198;
const origin = `http://localhost:${port}`;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: origin, launchOptions: executablePath ? { executablePath } : {} },
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next start --hostname localhost --port ${port}`,
    url: origin,
    reuseExistingServer: false,
    env: { VERCEL: "", APP_ORIGIN: origin, SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SECRET_KEY: "", APP_HASH_SECRET: "" },
  },
});

