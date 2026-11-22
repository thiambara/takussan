import { RouteSkeleton } from '@/components/console/RouteSkeleton';

/** TCK-2628 — sous la garde du layout de l'onglet, jamais au-dessus (TCK-426). */
export default function Loading() {
  return <RouteSkeleton variant="dashboard" />;
}
