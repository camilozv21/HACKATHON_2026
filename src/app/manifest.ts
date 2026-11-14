import type { MetadataRoute } from 'next';

/** Manifest de la PWA (se sirve en /manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Field Shift — tu finca desde el espacio',
    short_name: 'Field Shift',
    description: 'Explora rotaciones de cultivos con datos de la NASA para cuidar el suelo y adaptarte al clima.',
    start_url: '/es',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#05070d',
    theme_color: '#05070d',
    lang: 'es',
    categories: ['agriculture', 'weather', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
