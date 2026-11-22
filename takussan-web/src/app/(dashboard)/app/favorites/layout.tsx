import { CompareFloatingBar } from '@/components/compare/CompareFloatingBar';
import { CompareProvider } from '@/context/CompareContext';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de la section `favorites` de `/app` (ADR-0022, amendement du 2026-10-25).
 *
 * Elle ne sert que les espaces que ses écrans lisent et que la coque de `/app` ne sert pas :
 * `IntlProvider` les ajoute au dictionnaire du parent. La règle E de
 * `scripts/check-i18n-namespaces.mjs` exige ce layout dès que la section atteint un tel espace ;
 * sans lui, ils entreraient dans le document de tous les écrans de `/app`.
 *
 * TCK-2618 — la page des favoris du site public y est rendue (`SuiviDesFavoris`), et chacune de ses
 * cartes porte « Comparer » : le comparateur du site (`CompareProvider` et sa barre flottante, posés
 * par le layout public) est monté ici, sans quoi le bouton ne ferait rien sous `/app`.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app/favorites')}>
      <CompareProvider>
        {children}
        <CompareFloatingBar />
      </CompareProvider>
    </IntlProvider>
  );
}
