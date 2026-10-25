import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgencyStaffArea } from '@/lib/auth/guards';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-595 — le grand livre est celui du PERSONNEL d'une agence : l'API rend 403 à tout autre
 * compte. La garde vit dans le layout pour la raison de TCK-426 (un `redirect()` de page, sous un
 * `loading.tsx`, rendrait 200 et le squelette de la vue refusée).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  assertCanReachAgencyStaffArea((await getMeAction()).roles);
  // La section est aussi une frontière de dictionnaire (ADR-0022, amendement du 2026-10-25,
  // règle E) : `IntlProvider` ajoute ses espaces à ceux de la coque de `/app`.
  return <IntlProvider messages={await messagesPour('(dashboard)/app/commissions')}>{children}</IntlProvider>;
}
