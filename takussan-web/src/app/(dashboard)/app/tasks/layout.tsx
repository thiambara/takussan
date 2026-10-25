import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-591 §3 — même garde que `customers/` : la page des tâches est un écran de l'espace agent.
 * Elle vit dans le LAYOUT, au-dessus de toute frontière de suspension (TCK-426).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  assertCanReachAgentArea((await getMeAction()).roles);
  // La section est aussi une frontière de dictionnaire (ADR-0022, amendement du 2026-10-25,
  // règle E) : `IntlProvider` ajoute ses espaces à ceux de la coque de `/app`.
  return <IntlProvider messages={await messagesPour('(dashboard)/app/tasks')}>{children}</IntlProvider>;
}
