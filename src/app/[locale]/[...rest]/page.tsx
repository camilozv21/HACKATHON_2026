import { notFound } from 'next/navigation';

/** Cualquier ruta desconocida dentro de un idioma muestra el 404 amable (src/app/[locale]/not-found.tsx). */
export default function CatchAll() {
  notFound();
}
