import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de l'écran « Compte » / « Moi » (TCK-2493, ADR-0091 §3).
 *
 * Le changement d'espace lit l'espace `profile` (13 ko) : servi ici, et non par la coque de
 * `(public)`, il n'entre que dans le document de cet écran. `IntlProvider` l'ajoute au dictionnaire
 * du parent (règle E de `scripts/check-i18n-namespaces.mjs`).
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('[locale]/(public)/account')}>{children}</IntlProvider>;
}
