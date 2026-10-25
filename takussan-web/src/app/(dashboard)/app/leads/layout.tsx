import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-590 — la boîte « Demandes » est une surface partagée agence + bailleur, comme l'agenda : un
 * bailleur est destinataire des demandes de ses biens quand aucun agent n'en est le contact.
 *
 * La garde vit dans le layout, au-dessus de la frontière de suspension (cf.
 * `calendar/layout.tsx`, TCK-426).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  assertCanReachAgentArea((await getMeAction()).roles);
  // La section est aussi une frontière de dictionnaire (ADR-0022, amendement du 2026-10-25,
  // règle E) : `IntlProvider` ajoute ses espaces à ceux de la coque de `/app`.
  return <IntlProvider messages={await messagesPour('(dashboard)/app/leads')}>{children}</IntlProvider>;
}
