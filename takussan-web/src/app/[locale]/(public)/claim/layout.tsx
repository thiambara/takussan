import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de la réclamation du Radar (TCK-2390), sur le patron du lien de paiement :
 * les espaces que ses écrans lisent et que la coque de `(public)` ne sert pas n'entrent que dans le
 * document de cette section (ADR-0022, amendement du 2026-10-25 ; règle E de
 * `scripts/check-i18n-namespaces.mjs`).
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('[locale]/(public)/claim')}>{children}</IntlProvider>;
}
