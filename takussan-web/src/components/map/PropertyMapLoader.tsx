'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { PropertyMapProps } from './PropertyMap';

/**
 * Client-only wrapper around {@link PropertyMap}. Leaflet touches `window`
 * during module evaluation, so we load the real component via
 * `next/dynamic` with `ssr: false` to keep it out of the server bundle.
 *
 * Wave 3 — TCK-047.
 */
const PropertyMapInner = dynamic(
  () => import('./PropertyMap').then((m) => m.PropertyMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-[520px] w-full rounded-xl" />
    ),
  },
);

export function PropertyMapLoader(props: PropertyMapProps) {
  return <PropertyMapInner {...props} />;
}
