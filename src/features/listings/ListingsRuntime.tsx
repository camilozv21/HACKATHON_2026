'use client';

import { QueryProvider } from '@/lib/query/client';
import { ListingCard } from './ListingCard';
import { ListingsLayer } from './ListingsLayer';
import { MyListingPanel } from './MyListingPanel';
import { PublishListingDialog } from './PublishListingDialog';
import { useListingsStore } from './store';

/**
 * Fincas que venden (carga diferida, un solo chunk): capa del globo, tarjeta, formulario "Publicar mi finca" y
 * "Mi publicación". Se monta cuando la persona activa la capa o abre el formulario.
 */
export default function ListingsRuntime() {
  const visible = useListingsStore((s) => s.visible);
  const selected = useListingsStore((s) => s.selectedId !== null);
  const publishing = useListingsStore((s) => s.publish !== null);
  const managing = useListingsStore((s) => s.manageId !== null);
  return (
    <QueryProvider>
      {visible && <ListingsLayer />}
      {selected && !publishing && !managing && <ListingCard />}
      {publishing && <PublishListingDialog />}
      {managing && <MyListingPanel />}
    </QueryProvider>
  );
}
