import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de la section `bookings` de `/app` (ADR-0022, amendement du 2026-10-25).
 *
 * Elle ne sert que les espaces que ses écrans lisent et que la coque de `/app` ne sert pas :
 * `IntlProvider` les ajoute au dictionnaire du parent. La règle E de
 * `scripts/check-i18n-namespaces.mjs` exige ce layout dès que la section atteint un tel espace ;
 * sans lui, ils entreraient dans le document de tous les écrans de `/app`.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('(dashboard)/app/bookings')}>{children}</IntlProvider>;
}
