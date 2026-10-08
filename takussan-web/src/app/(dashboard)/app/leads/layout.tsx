import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgentArea } from '@/lib/auth/guards';

/**
 * TCK-590 — la boîte « Demandes » est une surface partagée agence + bailleur, comme l'agenda : un
 * bailleur est destinataire des demandes de ses biens quand aucun agent n'en est le contact.
 *
 * La garde vit dans le layout, au-dessus de la frontière de suspension (cf.
 * `calendar/layout.tsx`, TCK-426).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  assertCanReachAgentArea((await getMeAction()).roles);
  return <>{children}</>;
}
