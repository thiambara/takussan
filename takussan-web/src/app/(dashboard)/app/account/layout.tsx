import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { CadreDuProfil } from '@/components/profile/sommaire/CadreDuProfil';

/**
 * Frontière de dictionnaire de la section `account` de `/app` (ADR-0022, amendement du 2026-10-25).
 *
 * Elle ne sert que les espaces que ses écrans lisent et que la coque de `/app` ne sert pas :
 * `IntlProvider` les ajoute au dictionnaire du parent. La règle E de
 * `scripts/check-i18n-namespaces.mjs` exige ce layout dès que la section atteint un tel espace ;
 * sans lui, ils entreraient dans le document de tous les écrans de `/app`.
 *
 * TCK-2635 — `/app/account/privacy` est la section « Mes données » du profil : elle s'ouvre dans le
 * même cadre, sommaire compris.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app/account')}>
      <CadreDuProfil>{children}</CadreDuProfil>
    </IntlProvider>
  );
}
