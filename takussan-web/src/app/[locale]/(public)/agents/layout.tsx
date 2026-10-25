import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire des agents du site public (ADR-0022, amendement du 2026-10-25, P69.05).
 *
 * Elle ne sert que les espaces que ses écrans lisent et que la coque de `(public)` ne sert pas :
 * `IntlProvider` les ajoute au dictionnaire du parent. La règle E de
 * `scripts/check-i18n-namespaces.mjs` l'exige dès que la section atteint un tel espace ; sans
 * elle, ils entreraient dans le document de toutes les pages publiques.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('[locale]/(public)/agents')}>{children}</IntlProvider>;
}
