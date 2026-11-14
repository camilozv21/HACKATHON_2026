import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // El código de servidor (base de datos, secretos) nunca llega al navegador.
    files: ['src/features/**', 'src/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/server/*', '@/server/**'], message: 'Código solo de servidor: usa una ruta /api.' }] },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/sw.js',
  ]),
]);
