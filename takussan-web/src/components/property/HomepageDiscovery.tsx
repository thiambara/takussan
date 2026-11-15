'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { PropertyRow } from '@/components/property/cards/PropertyRow';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { useHomepageDiscovery } from '@/hooks/useHomepageDiscovery';
import type { HomepageDiscoveryData } from '@/types/property';
import { useUserLocation } from '@/components/providers/UserLocationProvider';
import { AUCUN_RACCOURCI, raccourcisDeLAccueil, type RaccourcisDeLAccueil } from '@/lib/queries/raccourcis-de-l-accueil';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';
import { rangeesSansDoublon } from '@/lib/rangees-de-l-accueil';
import { DeuxGestes } from '@/components/home/accueil/DeuxGestes';
import { TuilesDeQuartiers } from '@/components/home/accueil/TuilesDeQuartiers';
import { BlocProprietaire } from '@/components/home/accueil/BlocProprietaire';
import { ChangerDeVille } from '@/components/home/accueil/ChangerDeVille';
import { useQuery } from '@tanstack/react-query';
import { replie } from '@/lib/queries/domaine-des-lieux';

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
 * TCK-2495 (« Deux gestes », audit UX famille 1) — de haut en bas :
 *
 *  1. **Louer | Acheter, puis les catégories** (`DeuxGestes`), sous `lg` : au téléphone, deux
 *     touchers mènent à une liste filtrée. Au bureau, l'en-tête porte déjà les deux.
 *  2. la carte de rappel du persona connecté (TCK-2493) ;
 *  3. **les quartiers** de la ville des rangées, en tuiles (`TuilesDeQuartiers`) ;
 *  4. **trois rangées, de grammaire distincte et sans doublon** (`rangeesSansDoublon`) :
 *     « À <ville> » (Standard), « Coup de cœur » (Cover, l'emplacement vedette), « Tout juste
 *     publié » (Compact). « À louer », « À vendre » et « Récemment consultés » quittent l'accueil :
 *     cinq rangées de même grammaire répétaient les mêmes biens (60 cartes, relevé de l'audit) ;
 *  5. **le bloc propriétaire**, chiffré par l'offre de la ville (`BlocProprietaire`).
 *
 * Les cartes y sont ALLÉGÉES (`allegee`) : une pastille et le favori sur la photo, sans comparateur.
 *
 * Pas de hero marketing — l'intention de l'utilisateur est pré-formée, la recherche reste le premier
 * objet de la page (dans l'en-tête).
 *
 * Les rangées viennent d'UN appel. Le serveur dédoublonne déjà « Près de toi » / « À louer » /
 * « Nouveau » ; il laisse « Coup de cœur » chevaucher, et c'est le front qui retire de la rangée
 * locale et des nouveautés les biens de la vedette — jamais l'inverse (cf. `rangeesSansDoublon`).
 *
 * « À <ville> » et jamais « près de vous » : la ville est devinée par l'IP (ipapi.co) ou vaut le
 * marché de référence ; la position du visiteur n'est jamais demandée au chargement.
 */
export function HomepageDiscovery({
  donneesInitiales = null,
  raccourcis = AUCUN_RACCOURCI,
  repli = false,
  rappel = null,
}: {
  /**
   * Les quatre rangées déjà rendues par le serveur — TCK-432.
   *
   * `null` signifie « le serveur n'a rien à semer » (API en panne, ou appelant qui n'en fournit
   * pas) : le composant reprend alors, sans une ligne de moins, le comportement d'avant TCK-432.
   */
  readonly donneesInitiales?: HomepageDiscoveryData | null;
  /**
   * TCK-2495 — les sections lues par le SERVEUR seul : les quartiers et l'offre de la ville des
   * rangées. Absentes (`null`), elles ne sont pas rendues (ou le bloc perd son chiffre) ; le client ne
   * les redemande pas.
   */
  readonly raccourcis?: RaccourcisDeLAccueil;
  /**
   * TCK-1087 (P69.03) — rendu comme REPLI de la frontière `Suspense` de l'accueil, pendant que
   * `discovery` répond. Le repli et le contenu sont alors tous deux dans le HTML diffusé : sans
   * `<h1>` ici, la page n'en porte qu'un (TCK-432). `<main>` se dit occupé.
   * Il garde l'`id` du contenu principal (TCK-905) : pendant l'attente, le contenu est dans un
   * `<div hidden>` placé APRÈS le repli, et le lien d'évitement doit atterrir sur le `<main>` visible.
   */
  readonly repli?: boolean;
  /**
   * TCK-2493 (ADR-0091) — la carte de rappel du persona connecté, en tête de la page. Un nœud et non
   * un drapeau : la page la compose (`CarteDeRappel`), ce composant ne fait que lui donner sa place.
   * Rendue telle quelle dans le `<main>` : quand rien n'attend, elle ne rend rien, et le `gap` ne
   * compte pas d'enfant vide.
   */
  readonly rappel?: React.ReactNode;
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
  // TCK-2495, revue adverse — « À Dakar · Changer » : la ville CHOISIE l'emporte sur celle devinée.
  const [villeChoisie, setVilleChoisie] = useState<string | null>(null);

  const { rows, loading, failed } = useHomepageDiscovery({
    nearCity: villeChoisie ?? (guessed || undefined),
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
  const nearEyebrow = replacedCity ? t('near.fallbackEyebrow') : undefined;
  const nearTitle = replacedCity
    ? t('near.fallbackTitle', { city: nearCity, requestedCity: replacedCity })
    : t('near.titleCity', { city: nearCity });

  // Les tuiles et le bloc propriétaire parlent de la ville des rangées. Le serveur les a lus pour la
  // sienne ; une ville choisie les fait relire ici, et rien ne s'affiche de la ville d'avant entre-temps.
  const villeServie = near?.city ?? null;
  const autreVille =
    villeChoisie !== null && villeServie !== null && replie(villeServie) !== replie(raccourcis.ville ?? '');
  const relus = useQuery({
    queryKey: ['accueil', 'raccourcis', villeServie],
    queryFn: () => raccourcisDeLAccueil(villeServie),
    enabled: autreVille,
    staleTime: 60 * 60_000,
  });
  const raccourcisAffiches = autreVille ? (relus.data ?? AUCUN_RACCOURCI) : raccourcis;

  // TCK-2495 — aucun bien dans deux rangées ; la vedette garde les siens (impressions comptées).
  const { near: biensProches, featured: biensVedette, latest: biensNouveaux } = rangeesSansDoublon({
    near: near?.items ?? NO_ITEMS,
    featured: rows?.featured.items ?? NO_ITEMS,
    latest: rows?.latest.items ?? NO_ITEMS,
  });

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
      <main id={CONTENU_PRINCIPAL_ID} aria-busy={repli || undefined} tabIndex={-1} className="max-w-[1920px] mx-auto px-4 sm:px-6 pt-4 md:pt-6 pb-16 md:pb-20 flex flex-col gap-10 md:gap-12 focus:outline-none">
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
        {repli ? null : <h1 className="sr-only">{tPage('h1')}</h1>}
        {/* TCK-2495 — les deux gestes d'abord : sous l'en-tête, avant même la carte de rappel. */}
        <DeuxGestes className="lg:hidden" />
        {repli ? null : rappel}

        {raccourcisAffiches.ville && raccourcisAffiches.quartiers ? (
          <TuilesDeQuartiers ville={raccourcisAffiches.ville} quartiers={raccourcisAffiches.quartiers} />
        ) : null}

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
            properties={biensProches}
            loading={loading}
            error={error}
            priorityCount={2}
            allegee
            apresLeTitre={repli ? undefined : <ChangerDeVille actuelle={nearCity} onChoisir={setVilleChoisie} />}
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
          style={{ animationDelay: '120ms' }}
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
            properties={biensVedette}
            loading={loading}
            error={error}
            robeVedette
            emplacementSponsorise
            allegee
          />
        </section>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '200ms' }}
        >
          <PropertyRow
            variant="compact"
            eyebrow={t('latest.eyebrow')}
            title={t('latest.title')}
            viewAllHref="/properties?sort=created_desc"
            viewAllLabel={viewAll}
            properties={biensNouveaux}
            loading={loading}
            error={error}
            allegee
          />
        </div>

        {repli ? null : <BlocProprietaire offre={raccourcisAffiches.offre} />}
      </main>

      <Footer />
    </div>
  );
}
