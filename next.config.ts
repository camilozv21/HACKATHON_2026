import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: {
    // Mensajes ICU precompilados en build: quita intl-messageformat del bundle del cliente.
    // Consecuencia: no usar t.raw().
    messages: { path: './messages', format: 'json', locales: 'infer', precompile: true },
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Driver de PostgreSQL (solo servidor): no se empaqueta.
  serverExternalPackages: ['postgres'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'radix-ui'],
  },
};

export default withNextIntl(nextConfig);
