import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-2983 — frontière de dictionnaire de la page du lien d'action (`/fil/a/{jeton}`), sur le patron
 * de celle du lien de paiement : elle sert les espaces que la page lit et que la coque de `(public)`
 * ne sert pas (règle E de `scripts/check-i18n-namespaces.mjs`).
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('[locale]/(public)/fil')}>{children}</IntlProvider>;
}
