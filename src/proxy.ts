import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Todo menos /api, internos de Next/Vercel y archivos con extensión (sw.js, manifest, íconos…)
  matcher: '/((?!api|trpc|_next|_vercel|.*\..*).*)',
};
