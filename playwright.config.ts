import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Las pruebas usan WebGL por software: en paralelo se estorban y aparecen falsos fallos.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // La introducción de 3 pantallas ya vista (la prueba de accesibilidad la vuelve a mostrar).
    storageState: 'e2e/storage-state.json',
  },
  projects: [
    {
      name: 'pixel-7',
      use: {
        ...devices['Pixel 7'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/es`,
    reuseExistingServer: !process.env.CI,
    // Los e2e usan el agente mock: no gastan la ANTHROPIC_API_KEY ni dependen de la red.
    // El análisis usa el clima de plantilla (no NASA POWER) para que las opciones sean siempre las mismas.
    // Sin base de datos ni secreto de trabajos: publicaciones en memoria y mercado desde el seed (pnpm start carga
    // .env.local, y una variable vacía aquí gana sobre la de ese archivo).
    env: { AGENT_FORCE_MOCK: 'true', ANALYSIS_USE_POWER: 'false', DATABASE_URL: '', MARKET_JOB_SECRET: '' },
    timeout: 120_000,
  },
});
