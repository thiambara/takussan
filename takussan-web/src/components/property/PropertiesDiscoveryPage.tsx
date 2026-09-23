'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { List, Map as MapIcon, SearchX } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { SearchToolbar } from '@/components/search/SearchToolbar';
import { OutilsFlottantsDeListe } from '@/components/search/OutilsFlottantsDeListe';
import { WidenedSearchNotice } from '@/components/search/WidenedSearchNotice';
import { Pagination } from '@/components/search/Pagination';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PropertyMap } from '@/components/map';
import { SaveSearchButton } from '@/components/favorites/SaveSearchButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearch, type GraineDeRecherche } from '@/hooks/useSearch';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { CLES_DE_RECHERCHE, type SearchFilters } from '@/types/search';
import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';

/**
 * Canonical `/properties` discovery layout — Wave 3.
 *
 * Wraps the existing filter sidebar + toolbar + pagination (reused from
 * Wave 2) with the Wave 3 additions :
 *   - view toggle (list / map)
 *   - `SaveSearchButton` (requires auth)
 *   - canonical {@link PropertyCard} (owns favorites button)
 *
 * The underlying `useSearch` hook (reducer + URL sync) is untouched; it
 * already satisfies TCK-039 URL-sync AC.
 */

type View = 'list' | 'map';

/** Le début des résultats — là où la pagination ramène la vue (TCK-557). */
const ID_DES_RESULTATS = 'resultats';

/**
 * Les clés que l'utilisateur peut retirer depuis cet écran. Sert uniquement à décider si un 422
 * désigne un filtre RÉPARABLE.
 *
 * TCK-346 — **dérivée de `SEARCH_FILTER_KEYS`**, alors qu'elle était écrite à la main. Elle
 * citait dix-huit clés et venait donc d'en manquer trois (`lat`, `lng`, `radius_km`) : un 422
 * sur `radius_km` — que le plafond de 500 km rend parfaitement atteignable depuis un lien —
 * n'aurait proposé que « effacer toute la recherche ». Son propre commentaire disait déjà que
 * la liste faisant autorité vit ailleurs ; elle la recopiait quand même.
 *
 * `removeFilter` remonte à l'agrégateur (TCK-346), donc chaque clé listée ici est réellement
 * retirable, y compris `lat` et `lng` qui n'ont pas de puce propre.
 */
const FILTRES_CONNUS = new Set<keyof SearchFilters>(CLES_DE_RECHERCHE);

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-4/3 w-full rounded-xl" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function SearchEmpty({ onReset }: { onReset: () => void }) {
  const t = useTranslations('search.results');
  return (
    // `col-span-full` : ce bloc vit DANS la grille de résultats. C'est la raison pour laquelle
    // `EmptyState` spread ses props résiduelles et accepte `className`.
    <EmptyState
      className="col-span-full"
      icon={<SearchX className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
      action={
        <Button type="button" variant="outline" onClick={onReset}>
          {t('empty_cta')}
        </Button>
      }
    />
  );
}

function ViewToggle({
  view,
  onChange,
  className = '',
}: {
  view: View;
  onChange: (v: View) => void;
  className?: string;
}) {
  const t = useTranslations('property.discovery');

  return (
    <div
      role="tablist"
      aria-label={t('viewSwitchAria')}
      className={`inline-flex items-center rounded-full border border-border bg-card p-1 shadow-sm ${className}`}
    >
      <button
        role="tab"
        aria-selected={view === 'list'}
        onClick={() => onChange('list')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
          view === 'list'
            ? 'bg-primary text-white'
            : 'text-muted-foreground hover:text-primary'
        }`}
      >
        <List className="w-3.5 h-3.5" />
        {t('viewList')}
      </button>
      <button
        role="tab"
        aria-selected={view === 'map'}
        onClick={() => onChange('map')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
          view === 'map'
            ? 'bg-primary text-white'
            : 'text-muted-foreground hover:text-primary'
        }`}
      >
        <MapIcon className="w-3.5 h-3.5" />
        {t('viewMap')}
      </button>
    </div>
  );
}

/**
 * TCK-552 — la bascule de la rangée d'outils MOBILE : UN contrôle de 44 × 44 px, qui nomme la vue
 * où il mène.
 *
 * Les onglets `ViewToggle` faisaient 24 px de haut et occupaient une rangée entière (P5). Ici, un
 * seul bouton en bout de rangée : la carte depuis la liste, la liste depuis la carte. Les onglets
 * restent sur le bureau, qui n'est pas modifié.
 *
 * ⚠ **Icône seule, et c'est une mesure, pas un goût.** Avec son libellé (« Carte », 94 px), la
 * rangée laissait 92 px au tri à 360 px, et « Pertinence » s'y tronquait à 44 px visibles sur 70
 * (relevé au navigateur, notes du ticket). Le nom accessible reste le mot (`aria-label`), l'infobulle
 * aussi (`title`) ; et la pastille flottante, qui a la place, écrit « Carte » en toutes lettres.
 */
function BasculeDeVue({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useTranslations('property.discovery');
  const versLaCarte = view === 'list';
  const libelle = versLaCarte ? t('viewMap') : t('viewList');
  return (
    <button
      type="button"
      onClick={() => onChange(versLaCarte ? 'map' : 'list')}
      aria-label={libelle}
      title={libelle}
      className="grid size-11 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm transition-[color,border-color,scale] hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
    >
      {versLaCarte ? (
        <MapIcon className="size-5" aria-hidden />
      ) : (
        <List className="size-5" aria-hidden />
      )}
    </button>
  );
}

/**
 * TCK-552 — vrai quand l'élément est sorti de l'écran PAR LE HAUT (sous la `nav` fixe).
 *
 * Par le haut seulement : un élément encore sous le pli n'a pas été « dépassé ». Sans
 * `IntersectionObserver` (rendu serveur, jsdom), rien n'est jamais « dépassé » — la pastille
 * flottante ne double alors pas une rangée d'outils déjà à l'écran.
 */
function useDepasseParLeHaut(ref: React.RefObject<HTMLElement | null>, margeHautePx: number): boolean {
  const [depasse, setDepasse] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entree]) => {
        setDepasse(!entree.isIntersecting && entree.boundingClientRect.top < margeHautePx);
      },
      { rootMargin: `-${margeHautePx}px 0px 0px 0px` },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, margeHautePx]);
  return depasse;
}

/**
 * TCK-553 — le bas de la `nav` fixe du site public, MESURÉ, tant que `actif`.
 *
 * La vue carte mobile se cale dessous (AC3 : « toute la hauteur sous la `nav`, à 1 px près »). Une
 * constante n'y suffit pas, et c'est mesuré : la `nav` fait 71 px à 390, quand `NavbarSpacer` en
 * réserve 69 et `HAUTEUR_NAV_PX` en suppose 68. Sa hauteur suit son contenu (pastille de recherche
 * de TCK-549) : on la lit, et on la relit quand elle change.
 *
 * `null` tant que rien n'est mesuré (rendu serveur, première image) : la page retombe alors sur la
 * hauteur de `NavbarSpacer`.
 */
function useBasDeLaNav(actif: boolean): number | null {
  const [bas, setBas] = useState<number | null>(null);
  useEffect(() => {
    if (!actif) return;
    const nav = Array.from(document.querySelectorAll('nav')).find(
      (n) => getComputedStyle(n).position === 'fixed',
    );
    if (!nav) return;
    const lire = () => setBas(nav.getBoundingClientRect().bottom);
    lire();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(lire);
    obs.observe(nav);
    return () => obs.disconnect();
  }, [actif]);
  return bas;
}

/** Hauteur de la `nav` fixe du site public (68 px, mesurée) : la rangée qui passe dessous est hors d'atteinte. */
const HAUTEUR_NAV_PX = 68;

/** Le seuil `lg` de Tailwind. */
const LG_BREAKPOINT_PX = 1024;

/**
 * TCK-432 — la page reçoit désormais deux choses du serveur, et aucune n'est décorative.
 */
export type ProprietesDeLaListe = {
  /**
   * Le `<h1>`, DÉRIVÉ des mêmes filtres que le `<title>` (`lib/titre-de-la-liste.ts`).
   *
   * Il arrive en prop plutôt que d'être calculé ici, et pour une raison de fond : la dérivation
   * lit `filtresCanoniques` et les gabarits de `meta.propertiesFiltered` via `getTranslations` de
   * `next-intl/server`. La recalculer côté client serait une SECONDE dérivation du même titre —
   * exactement ce que le docblock de `titreEtDescription` existe pour empêcher.
   */
  readonly titre?: string;
  /** Ce que le rendu serveur a déjà obtenu, et pour quelle requête. `null` = rien à semer. */
  readonly graine?: GraineDeRecherche | null;
};

export function PropertiesDiscoveryPage({ titre, graine = null }: ProprietesDeLaListe = {}) {
  const t = useTranslations('search.results');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<View>('list');

  const {
    data,
    loading,
    error,
    filters,
    activeCount,
    search,
    resetFilters,
    removeFilter,
    repli,
    retirerTerme,
  } = useSearch({ graine });

  const properties = data?.data ?? [];
  const meta = data?.meta;

  // TCK-552 — à zéro résultat CONFIRMÉ (ni en chargement, ni en erreur), le tri et la bascule
  // n'agissent sur rien (E1) : ils ne sont pas rendus sous `lg`. Et la vue y retombe sur la
  // liste — sans quoi, la bascule masquée, un visiteur en vue carte y resterait enfermé devant
  // une carte vide, loin de l'état vide qui, lui, ne vit que dans la liste. Sous `lg` seulement :
  // le bureau garde ses onglets, donc sa sortie, et n'est pas modifié.
  const sousLg = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  const aucunResultat = !loading && !error && meta?.total === 0;
  const vue: View = aucunResultat && sousLg ? 'list' : view;

  // TCK-552 — Filtres et Carte à portée du pouce pendant le défilement (P4, AC3).
  const rangeeOutilsRef = useRef<HTMLDivElement>(null);
  const rangeeDepassee = useDepasseParLeHaut(rangeeOutilsRef, HAUTEUR_NAV_PX);

  // TCK-553 — sous `lg`, la vue carte occupe l'écran (M2) : le titre, la rangée d'outils et le pied
  // de page s'effacent, et la carte se cale sous la `nav` mesurée. Filtres et le retour à la liste
  // passent par la pastille flottante (TCK-552), montrée d'emblée en vue carte.
  const carteMobile = vue === 'map' && sousLg;
  const basDeLaNav = useBasDeLaNav(carteMobile);

  // TCK-553 (AC5) — la liste revient là où on l'a quittée. La vue carte mobile raccourcit le
  // document à la hauteur de l'écran, et le navigateur écrête alors le défilement à 0 : sans cette
  // mémoire, revenir à la liste repartait du haut, loin du bien qu'on regardait.
  const defilementDeLaListe = useRef(0);
  const defilementARestaurer = useRef<number | null>(null);
  const changerDeVue = (prochaine: View) => {
    if (prochaine === vue) return;
    if (vue === 'list') defilementDeLaListe.current = window.scrollY;
    else defilementARestaurer.current = defilementDeLaListe.current;
    setView(prochaine);
  };
  // Avant la peinture : la liste ne s'affiche jamais en haut pour sauter ensuite à sa position.
  useLayoutEffect(() => {
    if (vue !== 'list' || defilementARestaurer.current === null) return;
    const y = defilementARestaurer.current;
    defilementARestaurer.current = null;
    window.scrollTo(0, y);
  }, [vue]);

  // TCK-335 — le retour arrière repartait du haut. En traversée d'historique, Next ne
  // reprend pas la main sur le défilement : c'est la restauration NATIVE qui opère, et
  // elle opère pendant que cette page rend ses 10 squelettes (`CardSkeleton` ci-dessous)
  // pour 30 résultats à venir. Un document au tiers de sa hauteur écrête 1 200 px à 0.
  // Le signal passé au hook est donc « le commit porte les résultats », c'est-à-dire la
  // retombée de `loading` — et non le montage. `loading` couvre les trois issues (résultats,
  // liste vide, erreur) : la hauteur du document est arrêtée dans chacune.
  useScrollRestoration(!loading);

  // TCK-335 — un 422 nomme le filtre en cause dans `errors.<champ>`. S'il en désigne
  // UN SEUL et qu'il appartient bien à `SearchFilters`, on propose de retirer celui-là
  // plutôt que d'effacer toute la recherche : l'utilisateur garde son travail.
  //
  // ⚠ On n'affiche JAMAIS la prose de validation du serveur ici. Mesuré : le 422 de
  // `furnished` rend « The furnished field must be true or false. » sous `Accept-Language`
  // fr, en ET wo — `lang/fr/validation.php` ne porte pas la clé `boolean`. Le libellé
  // vient donc du dictionnaire du front, comme le veut le principe non négociable n°5.
  const cleFautive = (() => {
    if (!(error instanceof ApiError) || error.status !== 422) return null;
    const champs = Object.keys(error.validationErrors ?? {});
    if (champs.length !== 1) return null;
    const champ = champs[0] as keyof SearchFilters;
    return champ in filters || FILTRES_CONNUS.has(champ) ? champ : null;
  })();

  const handleFilterChange = (
    patch: Partial<SearchFilters>,
    options?: { continu?: boolean },
  ) => {
    // TCK-335, étape 5 — un commit de champ CONTINU écrase l'entrée d'historique ; tout le
    // reste l'empile. Voir le docblock de `search()` : `push` partout serait pire que le
    // `replace` d'origine tant que l'anti-rebond de l'étape 3 n'est pas en place.
    search({ ...filters, ...patch }, { historique: options?.continu ? 'replace' : 'push' });
  };

  // Derive the map filters from the active search filters. We only forward
  // the subset that the backend's `/map` endpoint supports.
  //
  // TCK-346 — `lat` / `lng` / `radius_km` en font partie DEPUIS ce lot, et leur
  // absence était un défaut que le rayon avait introduit : poser « à moins de
  // 3 km » puis basculer en vue carte faisait RÉAPPARAÎTRE les biens que la
  // liste venait d'écarter. Le filtre disparaissait en silence à la bascule,
  // sur le même écran, avec deux comptes différents pour la même recherche.
  //
  // Les trois clés voyagent ensemble ou pas du tout : `normaliserGeo()` garantit
  // qu'un point à moitié posé n'atteint jamais l'URL, et `/map` rendrait 422 sur
  // une demi-coordonnée — mêmes règles que `/search` (ADR-0023).
  //
  // ⚠ Pas de `sort` : `/map` n'en déclare aucun, et c'est motivé dans le
  // docblock de `PublicPropertyController::map()` — la sortie est un GeoJSON
  // plafonné, sans pagination, dont l'ordre n'est observable par personne.
  const mapFilters: Record<string, string | number | undefined> = {
    type: filters.type?.join(','),
    contract_type: filters.contract_type,
    price_min: filters.price_min,
    price_max: filters.price_max,
    lat: filters.lat,
    lng: filters.lng,
    radius_km: filters.radius_km,
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />

      <NavbarSpacer />

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-16 py-4 md:py-8">
        <div className="flex gap-6 items-start">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={resetFilters}
            activeCount={activeCount}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            total={loading || error ? null : (meta?.total ?? 0)}
          />

          <main className="flex-1 min-w-0">
            {/*
              TCK-432 — le `<h1>` de la liste, et il n'y en avait AUCUN (mesuré : `grep -o '<h1'`
              sur le HTML servi de `?type=villa` rendait 0). `docs/design-guidelines.md` pose
              « Hiérarchie stricte : `h1` → titre de page » ; la page commençait sa hiérarchie aux
              `<h3>` du panneau de filtres.

              Il dit ce que la page MONTRE, filtres compris — « Villa à louer à Dakar » — parce
              qu'il vient de la même dérivation que le `<title>`. Il est donc juste sur une page de
              facette autant que sur la page nue, sans deuxième règle à tenir.

              ⚠ `titre` est optionnel : la page reste montable sans lui (tests existants, et tout
              appelant qui ne le fournirait pas). Un `<h1>` VIDE serait pire que pas de `<h1>` —
              un lecteur d'écran annoncerait un titre de niveau 1 sans contenu — d'où la garde,
              qui porte sur la chaîne et pas seulement sur `undefined`.
            */}
            {titre?.trim() ? (
              // TCK-552 — plus compact sous `md` (P6) : à 28 px, « Biens immobiliers à louer » tenait
              // sur DEUX lignes à 360. Le texte ne change pas (TCK-432) ; à partir de `md`, rien ne
              // change non plus.
              <h1
                className={`font-display text-[22px] md:text-[34px] leading-[1.1] font-semibold text-foreground mb-2 md:mb-5 ${
                  vue === 'map' ? 'max-lg:hidden' : ''
                }`}
              >
                {titre}
              </h1>
            ) : null}

            {/* `scroll-mt-20` : ramenée par la pastille flottante, la rangée s'arrête SOUS la `nav`
                fixe (68 px), pas derrière elle. */}
            <div
              ref={rangeeOutilsRef}
              data-rangee-outils
              className={`scroll-mt-20 ${vue === 'map' ? 'max-lg:hidden' : ''}`}
            >
            <SearchToolbar
              // TCK-553 (M3) — en vue carte, le compte de la LISTE n'est pas affiché : la carte
              // affiche le sien (`PropertyMap`, AC4). `/map` ne reçoit pas `q` et ne place pas un
              // bien sans coordonnées — deux nombres pour une recherche, c'était l'écran de M3.
              total={error || vue === 'map' ? null : (meta?.total ?? 0)}
              loading={loading}
              filters={filters}
              activeCount={activeCount}
              onRemoveFilter={(key, subKey) => {
                if (key === 'type' && subKey) {
                  const next = (filters.type ?? []).filter((t) => t !== subKey);
                  handleFilterChange({
                    type: next.length > 0 ? next : undefined,
                  });
                } else if (key === 'condition' && subKey) {
                  // TCK-508 — seconde clé multi-valuée : la puce retire SA valeur, pas la clé.
                  const next = (filters.condition ?? []).filter((c) => c !== subKey);
                  handleFilterChange({
                    condition: next.length > 0 ? next : undefined,
                  });
                } else {
                  removeFilter(key);
                }
              }}
              onSortChange={(sort) => handleFilterChange({ sort })}
              onPerPageChange={(per_page) => handleFilterChange({ per_page })}
              onOpenSidebar={() => setSidebarOpen(true)}
              // TCK-552 — le tri n'agit ni sur la carte (`/map` n'en déclare aucun, cf.
              // `mapFilters`) ni sur une liste vide (M4, E1, AC8).
              afficherTri={vue === 'list' && !aucunResultat}
              basculeDeVue={
                aucunResultat ? undefined : <BasculeDeVue view={vue} onChange={changerDeVue} />
              }
              // TCK-552 — la sauvegarde au BOUT des puces, et seulement s'il y en a (P7, AC5).
              // Son libellé est conservé, et c'est vérifié : `SaveSearchButton` envoie
              // `notification_frequency: 'off'` — elle SAUVEGARDE, elle ne crée aucune alerte.
              // « Créer une alerte » aurait été le mensonge.
              finDesPuces={
                activeCount > 0 ? (
                  <SaveSearchButton
                    filters={filters}
                    activeCount={activeCount}
                    className="lg:hidden"
                  />
                ) : null
              }
            />
            </div>

            {/*
              La rangée du BUREAU — onglets et sauvegarde —, inchangée à partir de `lg` (contrainte
              du ticket). Sous `lg`, ses deux contrôles vivent dans la rangée d'outils et au bout
              des puces : elle n'y est plus rendue.
            */}
            <div data-rangee="vue-bureau" className="mb-5 hidden flex-wrap items-center gap-3 lg:flex">
              <ViewToggle view={vue} onChange={changerDeVue} />
              <SaveSearchButton
                filters={filters}
                activeCount={activeCount}
                className="ml-auto"
              />
            </div>

            <OutilsFlottantsDeListe
              // TCK-553 — en vue carte, la rangée d'outils n'est plus rendue sous `lg` : la pastille
              // est alors la SEULE sortie (et le seul accès aux filtres). Elle est montrée d'emblée.
              visible={(rangeeDepassee || vue === 'map') && !sidebarOpen}
              activeCount={activeCount}
              vue={vue}
              onOuvrirFiltres={() => setSidebarOpen(true)}
              // TCK-553 — le vieux `scrollIntoView` vers la rangée d'outils n'a plus d'objet : la
              // carte mobile est plein écran, posée sous la `nav` quel que soit le défilement, et
              // le retour à la liste restaure SA position (AC5, `changerDeVue`).
              onBasculerVue={() => changerDeVue(vue === 'list' ? 'map' : 'list')}
            />

            {vue === 'map' ? (
              /*
                TCK-553 (M2, AC3) — sous `lg`, la carte est posée en `fixed` du bas de la `nav`
                mesurée au bas de l'écran : le doigt ne déplace plus la carte « au lieu de la page »,
                il n'y a plus de page à déplacer. `z-0` : sous la `nav` (z-50) et la pastille (z-40),
                et les calques de Leaflet (jusqu'à z-1000) restent enfermés dans ce contexte.
                À partir de `lg`, ce conteneur n'a aucun effet : le bureau ne change pas.
              */
              <div
                data-vue-carte
                className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-[var(--haut-de-la-carte,69px)] max-lg:z-0"
                style={
                  basDeLaNav === null
                    ? undefined
                    : ({ '--haut-de-la-carte': `${basDeLaNav}px` } as React.CSSProperties)
                }
              >
                <PropertyMap filters={mapFilters} pleinEcranSousLg />
              </div>
            ) : (
              <>
                {/*
                  TCK-338 — l'étiquette du repli conjonctif, au-dessus des résultats qu'elle
                  qualifie et sous le compteur qu'elle relativise.

                  Trois conditions, et chacune écarte une affirmation concurrente :
                  · `repli` est `null` sous le régime nominal — rien à dire, rien d'affiché ;
                  · `!error` — un bandeau d'erreur et un « voici 63 biens proches » sur le même
                    écran se contrediraient, comme l'état vide et l'erreur avant TCK-335 ;
                  · vue LISTE seulement — `/map` est un autre endpoint, qui ne reçoit même pas
                    `q` (cf. `mapFilters` ci-dessus) : l'étiquette y parlerait de résultats que
                    la carte n'affiche pas.
                */}
                {repli && !error && (
                  <WidenedSearchNotice
                    className="mb-5"
                    termesSansResultat={repli.termesSansResultat}
                    totalElargi={repli.totalElargi}
                    onRetirerTerme={retirerTerme}
                    onEffacerRecherche={() => search({ q: '' })}
                  />
                )}

                {error && !loading && (
                  <ErrorState
                    className="mb-6"
                    message={
                      error instanceof ApiError && error.status === 422
                        ? cleFautive
                          ? t('error_invalid_filter_named', { filter: cleFautive })
                          : t('error_invalid_filter')
                        : t('error')
                    }
                    onRetry={cleFautive ? () => removeFilter(cleFautive) : resetFilters}
                    retryLabel={cleFautive ? t('error_retry') : t('empty_cta')}
                  />
                )}

                {/* TCK-557 — la pagination ramène la vue ICI, sous la `nav` fixe (cf. `NavbarSpacer`). */}
                <div
                  id={ID_DES_RESULTATS}
                  className={`scroll-mt-[85px] lg:scroll-mt-[152px] grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-10 transition-opacity duration-200 ${
                    loading
                      ? 'opacity-50 pointer-events-none'
                      : 'opacity-100'
                  }`}
                >
                  {loading && properties.length === 0 ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <CardSkeleton key={i} />
                    ))
                  ) : properties.length === 0 && !loading && !error ? (
                    // TCK-335 — `!error` : l'état vide et l'état d'erreur s'excluent.
                    // Ils s'affichaient ensemble, si bien qu'un filtre invalide produisait
                    // « 0 biens trouvés » ET « Aucun bien trouvé » ET « Une erreur est
                    // survenue » sur le même écran — trois affirmations concurrentes.
                    <SearchEmpty onReset={resetFilters} />
                  ) : (
                    properties.map((property, i) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        index={i}
                        priority={i < 4}
                        sizes={CARD_SIZES_SEARCH_GRID}
                      />
                    ))
                  )}
                </div>

                {meta && meta.last_page > 1 && (
                  <Pagination
                    currentPage={meta.current_page}
                    lastPage={meta.last_page}
                    filters={filters}
                    cibleDuDefilement={ID_DES_RESULTATS}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* TCK-553 — pas de pied de page sous la carte plein écran (M2, AC3). */}
      <div className={vue === 'map' ? 'max-lg:hidden' : undefined}>
        <Footer />
      </div>
    </div>
  );
}
