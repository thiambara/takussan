import { RouteSkeleton } from '@/components/console/RouteSkeleton';

/** TCK-2602 — le repli propre à l'écran « en ligne » : sans lui, celui de la fiche (`[id]/loading.tsx`) s'afficherait. */
export default function Loading() {
  return <RouteSkeleton variant="form" />;
}
