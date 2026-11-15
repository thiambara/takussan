'use client';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

import { SuiviDesFavoris } from './SuiviDesFavoris';

export { DELAI_RELECTURE_DU_COMPTE_MS } from './SuiviDesFavoris';

/**
 * TCK-2508 — la page Favoris du site public (`/<langue>/favorites`), « Le suivi » : la coque du site
 * autour de {@link SuiviDesFavoris}, qui porte tout le contenu (et son histoire). TCK-2618 — le
 * contenu est sorti de ce fichier pour que `/app/favorites` et `/app/saved-searches` le rendent dans
 * la coque de `/app` sans importer celle du site.
 */
export function PublicFavoritesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      {/* Sans cale, le titre passait SOUS la barre fixe à toutes les largeurs (revue design du
          2026-09-16 : « Mes favoris » invisible à 390 comme à 1366). */}
      <NavbarSpacer />
      <main
        id={CONTENU_PRINCIPAL_ID}
        tabIndex={-1}
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 lg:pt-10 focus:outline-none"
      >
        <SuiviDesFavoris />
      </main>
      <Footer />
    </div>
  );
}
