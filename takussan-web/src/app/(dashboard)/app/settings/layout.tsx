import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de la section `settings` de `/app` (ADR-0022, amendement du 2026-10-25).
 *
 * TCK-2671 — la page « Offre et passage en pro » (`settings/agency/upgrade`) est une section de la
 * fiche de l'agence : elle lit le cadre de la fiche (`admin.*`) et le bloc de l'offre (`billing.*`),
 * que la coque de `/app` ne sert pas. `IntlProvider` les ajoute au dictionnaire du parent ; la règle E
 * de `scripts/check-i18n-namespaces.mjs` exige ce layout dès que la section atteint un tel espace.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('(dashboard)/app/settings')}>{children}</IntlProvider>;
}
