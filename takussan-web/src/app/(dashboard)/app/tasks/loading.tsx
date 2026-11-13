import { RouteSkeleton } from '@/components/console/RouteSkeleton';

// TCK-382 / AC1 — la page « Tâches » attend /me et les capacités côté serveur (TCK-2596, lot 2) :
// son segment a son propre repli, comme l'agenda.
export default function Loading() {
  return <RouteSkeleton variant="list" />;
}
