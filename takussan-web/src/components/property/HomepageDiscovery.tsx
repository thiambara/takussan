'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { PropertyRow } from '@/components/property/cards/PropertyRow';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { RecentlyViewedCarousel } from '@/components/property/RecentlyViewedCarousel';
import { useHomepageDiscovery } from '@/hooks/useHomepageDiscovery';
import type { HomepageDiscoveryData } from '@/types/property';
import { useUserLocation } from '@/components/providers/UserLocationProvider';
import { AUCUN_RACCOURCI, type RaccourcisDeLAccueil } from '@/lib/queries/raccourcis-de-l-accueil';

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
 *
 * TCK-628 — densifiée sur le modèle d'Airbnb : plus de grand titre visible entre la barre et la
 * première rangée (le `<h1>` reste, pour les lecteurs d'écran et les robots), sept cartes par rangée
 * sur un écran d'ordinateur (cf. `PropertyRow`), et une rangée « À vendre » lue sur la recherche
 * publique (cf. `raccourcisDeLAccueil`).
 *
 * Retour du porteur du 2026-10-10 : TOUTES les sections sont des rangées de cartes. Les tuiles par
 * ville, par type et par quartier sont retirées, et « À louer » quitte la carte horizontale (deux
 * par ligne au plus) pour la carte Standard, qui en range sept.
 *
 * Les rangées, une variante de carte par section :
 *  - Standard  → « Près de toi », « À louer », « À vendre », « Récemment consultés »
 *  - Cover 3:4 → « Coup de cœur · Sélection de la semaine » (signature)
 *  - Compact   → « Nouveau · Tout juste publié »
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
  raccourcis = AUCUN_RACCOURCI,
}: {
  /**
   * Les quatre rangées déjà rendues par le serveur — TCK-432.
   *
   * `null` signifie « le serveur n'a rien à semer » (API en panne, ou appelant qui n'en fournit
   * pas) : le composant reprend alors, sans une ligne de moins, le comportement d'avant TCK-432.
   */
  readonly donneesInitiales?: HomepageDiscoveryData | null;
  /**
   * TCK-628 — la section lue par le SERVEUR seul (« À vendre »). Absente (`null`), elle n'est pas
   * rendue ; le client ne la redemande pas.
   */
  readonly raccourcis?: RaccourcisDeLAccueil;
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

      {/* Cale à la hauteur réelle de la navbar fixe, palier par palier. */}
      <NavbarSpacer />

      {/* `flex gap-*` et non `space-y-*` : en Tailwind 4, `space-y` pose sa marge SOUS chaque
          enfant sauf le DERNIER — et le dernier est « Récemment consultés », masqué sans
          historique. La rangée d'avant gardait donc sa marge : 176 px de vide avant le pied de
          page au lieu de 96, mesuré le 2026-09-28. Un `gap` ignore les enfants masqués.

          TCK-628 — la page commence à 16-24 px sous la barre (elle commençait à 48 px, PUIS le
          `<h1>` de 40 px et ses 48 px de marge), les sections sont à 40-48 px l'une de l'autre
          (80 avant), et le conteneur suit celui de la barre : 1920 px au plus, 24 px de gouttière
          à partir de `sm` (48 avant). La barre et la première carte commencent au même x. */}
      <main className="max-w-[1920px] mx-auto px-4 sm:px-6 pt-4 md:pt-6 pb-16 md:pb-20 flex flex-col gap-10 md:gap-12">
        {/*
          TCK-432 — le `<h1>` de l'accueil, et il n'y en avait AUCUN (mesuré : `grep -o '<h1'`
          sur le HTML servi rendait 0). `docs/design-guidelines.md` § Typographie pose pourtant
          « Hiérarchie stricte : `h1` → titre de page », et c'est de l'accessibilité avant d'être
          du référencement : un lecteur d'écran qui cherche le titre de la page ne le trouvait pas,
          les `<h2>` des rangées commençant la hiérarchie au deuxième niveau.

          TCK-628 — il quitte l'ÉCRAN, pas la page : `sr-only`. Le porteur, comparant l'accueil à
          celui d'Airbnb : « trop d'espace entre la barre et la première rangée ». Le titre
          « Annonces immobilières au Sénégal » en occupait environ 136 px (40 px de texte, 48 de marge, et
          les 48 de `pt-12` au-dessus), pour dire ce que la page montre déjà. Il reste le premier
          titre de l'arbre d'accessibilité et le seul `<h1>` du HTML servi (`rendu-serveur.test`).

          ⚠⚠ L'histoire du `-mb-8` qui chevauchait la première rangée (TCK-432) est close avec lui :
          *une marge négative écrite pour corriger une autre marge suppose que les deux
          s'additionnent — et dans une v4 qui pose ses écarts en `:where()`, elles ne
          s'additionnent pas.*
        */}
        <h1 className="sr-only">{tPage('h1')}</h1>

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
            variant="standard"
            eyebrow={t('rent.eyebrow')}
            title={t('rent.title')}
            viewAllHref="/properties?contract_type=rent"
            viewAllLabel={viewAll}
            properties={rows?.rent.items ?? NO_ITEMS}
            loading={loading}
            error={error}
          />
        </div>

        {/* Rangée signature — fond cream + pattern bogolan stylisé (≤5%).

            ⚠ `isolate` PORTE le fond, il n'est pas décoratif. Le fond est en `-z-10` : sans
            contexte d'empilement à lui, il se range dans celui de la page et passe SOUS le
            `bg-background` de la racine. L'animation d'entrée en créait un le temps de jouer
            (opacité < 1, `transform`), puis `backwards` le rendait à la fin — la carte
            s'affichait, puis disparaissait. Mesuré le 2026-09-28 : pendant l'animation le fond
            est peint ; 2,5 s après, le point au cœur de sa marge renvoie `MAIN`.

            TCK-628 — le fond déborde de 24 à 32 px au lieu de 32 à 48 : les sections voisines
            sont plus proches (40 à 48 px), un débord de 48 aurait touché leurs titres. */}
        <section
          className="animate-section-enter relative isolate"
          style={{ animationDelay: '200ms' }}
        >
          <div className="absolute inset-x-[-12px] inset-y-[-20px] md:inset-x-[-20px] md:inset-y-[-24px] -z-10 rounded-[28px] overflow-hidden bg-card">
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

        {raccourcis.vente && (
          <PropertyRow
            variant="standard"
            eyebrow={t('sale.eyebrow')}
            title={t('sale.title')}
            viewAllHref="/properties?contract_type=sale"
            viewAllLabel={viewAll}
            properties={raccourcis.vente}
            loading={false}
            error={null}
          />
        )}

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

        {/* `empty:hidden` : sans historique, le carrousel rend `null` — l'enveloppe vide ne doit
            pas compter pour un enfant du `gap` (cf. `<main>`). */}
        <div
          className="animate-section-enter empty:hidden"
          style={{ animationDelay: '360ms' }}
        >
          <RecentlyViewedCarousel completerParDesSimilaires />
        </div>
      </main>

      <Footer />
    </div>
  );
}
