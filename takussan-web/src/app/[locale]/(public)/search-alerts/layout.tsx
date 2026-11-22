import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire des pages par lien `/search-alerts/*` (ADR-0022, amendement du 2026-10-25 ; TCK-2514).
 *
 * Elle ne sert que les espaces que ses écrans lisent et que la coque de `(public)` ne sert pas
 * (`lienPublic`, la coque de lien) : `IntlProvider` les ajoute au dictionnaire du parent. La règle E
 * de `scripts/check-i18n-namespaces.mjs` l'exige dès que la section atteint un tel espace ; sans
 * elle, ils entreraient dans le document de toutes les pages publiques.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('[locale]/(public)/search-alerts')}>{children}</IntlProvider>;
}
