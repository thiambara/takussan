import { RouteSkeleton } from '@/components/console';

/**
 * TCK-426 — ce repli était à `overview/`, où il couvrait AUSSI `overview/page.tsx`,
 * l'aiguilleur par rôle. Or cet aiguilleur ne rend aucun document : ses sept `redirect()` sont
 * tout ce qu'il fait, et la frontière de suspension les rendait 200 au lieu de 307. Descendre le
 * repli d'un cran le rend à chaque VUE — qui, elle, a bien quelque chose à montrer — et le
 * retire de l'aiguilleur, qui n'avait rien à y gagner.
 */
export default function Loading() {
  return <RouteSkeleton variant="dashboard" />;
}
