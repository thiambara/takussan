'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { PropertyRow } from '@/components/property/cards/PropertyRow';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { RecentlyViewedCarousel } from '@/components/property/RecentlyViewedCarousel';
import { useHomepageDiscovery } from '@/hooks/useHomepageDiscovery';
import type { HomepageDiscoveryData } from '@/types/property';
import { useUserLocation } from '@/components/providers/UserLocationProvider';

const NO_ITEMS = [] as const;

/**
 * Deadline on the geo-IP provider.
 *
 * Waiting for it is what keeps the page at ONE request (TCK-247 AC1): fetching
 * before the city is known, then again once it resolves, is two. But the
 * provider calls a third party (ipapi.co) with no timeout of its own, and a
 * request that stalls without ever rejecting would leave the homepage in
 * skeletons forever. So the wait is bounded: past this, we ask without a city
 * and the backend serves its reference market.
 */
const GEO_DEADLINE_MS = 1200;

function useGeoSettled(geoLoading: boolean): boolean {
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDeadlinePassed(true), GEO_DEADLINE_MS);
    return () => clearTimeout(id);
  }, []);

  return !geoLoading || deadlinePassed;
}

/**
 * Homepage publique — TCK-129, câblée sur l'endpoint unique de TCK-247.
 * Quatre rangées scrollables, une variante de carte par section :
 *  - Standard 4:3   → « Près de toi · À découvrir à Dakar »
 *  - Listing wide   → « À louer · Pour ton prochain logement »
 *  - Cover 3:4      → « Coup de cœur · Sélection de la semaine » (signature)
 *  - Compact 1:1    → « Nouveau · Tout juste publié »
 *
 * Pas de hero marketing — l'intention de l'utilisateur est pré-formée. La
 * navbar porte search + catégories ; cette page démarre directement par la
 * découverte.
 *
 * Les quatre rangées viennent d'UN appel, et la déduplication entre « Près de
 * toi » / « À louer » / « Nouveau » est faite par le serveur, qui pioche dans
 * un pool plus large pour recompléter les rangées au lieu de les laisser
 * maigrir. « Coup de cœur » reste exempte : une rangée curée a le droit de
 * chevaucher les autres.
 */
export function HomepageDiscovery({
  donneesInitiales = null,
}: {
  /**
   * Les quatre rangées déjà rendues par le serveur — TCK-432.
   *
   * `null` signifie « le serveur n'a rien à semer » (API en panne, ou appelant qui n'en fournit
   * pas) : le composant reprend alors, sans une ligne de moins, le comportement d'avant TCK-432.
   */
  readonly donneesInitiales?: HomepageDiscoveryData | null;
} = {}) {
  const t = useTranslations('homepage.row');
  const tPage = useTranslations('homepage');
  const { location, loading: geoLoading, city: guessedCity } = useUserLocation();
  const geoSettled = useGeoSettled(geoLoading);

  // `location.city` brut, pas le raccourci `city` du provider : celui-ci
  // retombe déjà sur Dakar, ce qui ferait passer « on ne sait pas où est le
  // visiteur » pour « le visiteur est à Dakar ». Le backend distingue les deux
  // et ne rebaptise la rangée que dans le second cas.
  const guessed = location?.city?.trim();

  const { rows, loading, failed } = useHomepageDiscovery({
    nearCity: guessed || undefined,
    enabled: geoSettled,
    donneesInitiales,
  });

  const viewAll = t('viewAll');
  const error = failed ? t('error') : null;

  // Le titre de la rangée locale est DÉRIVÉ de la réponse, jamais deviné :
  // quand la ville du visiteur ne porte pas assez d'annonces, le serveur
  // bascule la rangée entière sur sa ville de référence et le dit. Titrer
  // « À découvrir à Ziguinchor » au-dessus de biens dakarois serait faux.
  const near = rows?.near;
  const nearCity = near?.city ?? guessedCity;
  const replacedCity = near?.fallback ? near.requested_city : null;
  const nearEyebrow = replacedCity ? t('near.fallbackEyebrow') : t('near.eyebrow');
  const nearTitle = replacedCity
    ? t('near.fallbackTitle', { city: nearCity, requestedCity: replacedCity })
    : t('near.title', { city: nearCity });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Spacer : 1ère ligne navbar (~65px) + ligne catégories (~68px). */}
      <div className="h-[133px]" />

      <main className="max-w-[1440px] mx-auto px-6 md:px-12 pt-12 pb-24 space-y-20">
        {/*
          TCK-432 — le `<h1>` de l'accueil, et il n'y en avait AUCUN (mesuré : `grep -o '<h1'`
          sur le HTML servi rendait 0). `docs/design-guidelines.md` § Typographie pose pourtant
          « Hiérarchie stricte : `h1` → titre de page », et c'est de l'accessibilité avant d'être
          du référencement : un lecteur d'écran qui cherche le titre de la page ne le trouvait pas,
          les quatre `<h2>` des rangées commençant la hiérarchie au deuxième niveau.

          Il dit ce que la page MONTRE — des annonces au Sénégal — et non le nom de la marque, qui
          vit dans le `<title>` du layout. `font-display` (Bricolage Grotesque) comme le veulent
          les directives pour `h1`-`h3` ; la taille reste au-dessus des `h2` des rangées
          (26/30 px) sans rien déplacer d'autre : ce ticket n'ouvre aucune refonte visuelle, et
          il n'introduit pas le hero marketing que la home refuse depuis TCK-129.

          ⚠⚠ **`-mb-8` ICI CHEVAUCHAIT LA PREMIÈRE RANGÉE, et le motif se reproduira ailleurs.**
          Écrit pour ramener l'écart de `space-y-20` (80 px) à 48 px, il l'a mis à **−32 px** :
          en Tailwind v4, `space-y-*` est défini dans un `:where()`, donc à spécificité NULLE.
          Un utilitaire de marge explicite ne s'y AJOUTE pas, il le REMPLACE. Mesuré dans le
          navigateur le 2026-08-28 :

              h1        top 181 · bottom 223
              1re rangée top 191                    ← 32 px de recouvrement
              margin-top du frère suivant : 0px     ← et non 80px

          Le sur-titre « Près de toi » passait donc SOUS le titre de la page. Corrigé en écrivant
          l'écart voulu en clair (`mb-12`, 48 px) au lieu de le calculer contre une valeur que la
          cascade n'applique jamais.

          *Une marge négative écrite pour corriger une autre marge suppose que les deux
          s'additionnent — et dans une v4 qui pose ses écarts en `:where()`, elles ne
          s'additionnent pas.* Aucun test ne pouvait le voir : jsdom ne fait pas de mise en page.
        */}
        <h1 className="font-display text-[32px] md:text-[40px] leading-[1.05] font-semibold text-foreground mb-12">
          {tPage('h1')}
        </h1>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '40ms' }}
        >
          <PropertyRow
            variant="standard"
            eyebrow={nearEyebrow}
            title={nearTitle}
            viewAllHref={`/properties?city=${encodeURIComponent(nearCity)}`}
            viewAllLabel={viewAll}
            properties={near?.items ?? NO_ITEMS}
            loading={loading}
            error={error}
            priorityCount={2}
          />
        </div>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '120ms' }}
        >
          <PropertyRow
            variant="listing"
            eyebrow={t('rent.eyebrow')}
            title={t('rent.title')}
            viewAllHref="/properties?contract_type=rent"
            viewAllLabel={viewAll}
            properties={rows?.rent.items ?? NO_ITEMS}
            loading={loading}
            error={error}
          />
        </div>

        {/* Rangée signature — fond cream + pattern bogolan stylisé (≤5%). */}
        <section
          className="animate-section-enter relative"
          style={{ animationDelay: '200ms' }}
        >
          <div className="absolute inset-x-[-12px] inset-y-[-32px] md:inset-x-[-24px] md:inset-y-[-48px] -z-10 rounded-[28px] overflow-hidden bg-card">
            <div className="absolute inset-0 opacity-[0.045] text-foreground">
              <BogolanPattern className="w-full h-full" color="currentColor" />
            </div>
          </div>

          <PropertyRow
            variant="cover"
            eyebrow={t('featured.eyebrow')}
            title={t('featured.title')}
            viewAllHref="/properties?featured=true"
            viewAllLabel={viewAll}
            properties={rows?.featured.items ?? NO_ITEMS}
            loading={loading}
            error={error}
          />
        </section>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '280ms' }}
        >
          <PropertyRow
            variant="compact"
            eyebrow={t('latest.eyebrow')}
            title={t('latest.title')}
            viewAllHref="/properties?sort=created_desc"
            viewAllLabel={viewAll}
            properties={rows?.latest.items ?? NO_ITEMS}
            loading={loading}
            error={error}
          />
        </div>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '360ms' }}
        >
          <RecentlyViewedCarousel />
        </div>
      </main>

      <Footer />
    </div>
  );
}
