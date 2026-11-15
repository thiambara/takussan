import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-2688 — frontière de dictionnaire de la VITRINE de la partie connectée (ADR-0022, amendement
 * du 2026-10-25).
 *
 * La vitrine rend les primitives de `/app` telles que les pages les montent, et certaines lisent
 * l'espace `console` (le champ de recherche : « Recherche en cours… », « Effacer la recherche »).
 * Sans cette frontière, la règle E de `scripts/check-i18n-namespaces.mjs` ferait servir `console`
 * par la coque de `(public)`, donc dans le document de TOUTES les pages publiques. Ici, il n'entre
 * que dans celui de la vitrine (404 en production, cf. `page.tsx`).
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('[locale]/(public)/playground/vitrine')}>{children}</IntlProvider>;
}
