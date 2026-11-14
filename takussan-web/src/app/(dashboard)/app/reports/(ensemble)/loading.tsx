import { RouteSkeleton } from '@/components/console/RouteSkeleton';

/** TCK-2628 — sous la garde de `(ensemble)/layout.tsx`, jamais au-dessus (TCK-426). */
export default function Loading() {
  return <RouteSkeleton variant="dashboard" />;
}
