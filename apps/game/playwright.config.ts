import { defineConfig, devices } from '@playwright/test';

// Locally a system Chrome can be used with PW_CHROMIUM_PATH=/path/to/chrome.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    baseURL: 'http://localhost:4173',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        // Expose real host candidates instead of mDNS names, which cannot be
        // resolved on CI machines. See docs/ARCHITECTURE.md (local network).
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        // Several pages (game + phones) run at once; keep background pages at full speed.
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Serves the assembled site (game at /, controller at /c/); run `pnpm build` first.
      command: 'pnpm exec vite preview --port 4173 --strictPort --outDir ../../dist',
      url: 'http://localhost:4173/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Local PeerJS signalling server, so tests never depend on the public one.
      command: 'pnpm exec peerjs --port 9000 --key peerjs --host 127.0.0.1',
      url: 'http://127.0.0.1:9000/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
