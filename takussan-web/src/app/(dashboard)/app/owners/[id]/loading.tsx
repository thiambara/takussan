import { RouteSkeleton } from '@/components/console/RouteSkeleton';

/** TCK-2641 — la fiche d'un bailleur : sans ce repli, celui du carnet (une liste) s'afficherait. */
export default function Loading() {
  return <RouteSkeleton variant="detail" />;
}
