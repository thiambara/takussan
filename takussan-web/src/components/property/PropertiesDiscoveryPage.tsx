'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { List, Map as MapIcon } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { ErrorState } from '@/components/feedback';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { ActualisationDesResultats } from '@/components/search/ActualisationDesResultats';
import { PucesDeFiltres, SearchToolbar, TailleDePage } from '@/components/search/SearchToolbar';
import { OutilsFlottantsDeListe } from '@/components/search/OutilsFlottantsDeListe';
import { WidenedSearchNotice } from '@/components/search/WidenedSearchNotice';
import { SearchEmpty } from '@/components/search/SearchEmpty';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PropertyMap } from '@/components/map';
import { SaveSearchButton } from '@/components/favorites/SaveSearchButton';
import { Skeleton } from '@/components/ui/skeleton';
import { filtersToParams, useSearch, type GraineDeRecherche } from '@/hooks/useSearch';
import { parametresDeLaCarte } from '@/lib/recherche-publique';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { positionVerticale } from '@/hooks/useVerrouDeDefilement';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { CLES_DE_RECHERCHE, type SearchFilters } from '@/types/search';
import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';
import { ArriveeSponsorisee } from '@/components/boost/arrivee-sponsorisee';
import { badgeDe, lireEmplacements, placementDe } from '@/components/boost/lecture-recherche';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { usePathname } from 'next/navigation';
import { BasculeDeDensite } from '@/components/property/liste/BasculeDeDensite';
import { VoirPlus } from '@/components/property/liste/VoirPlus';
import { useDensite, type Densite } from '@/components/property/liste/densite';
import { suiteDesPages, type CarteDeLaListe } from '@/components/property/liste/emplacements';
import { useSuiteDeLaListe } from '@/components/property/liste/suite';

/**
 * Canonical `/properties` discovery layout — Wave 3.
 *
 * Wraps the existing filter sidebar + toolbar + pagination (reused from
 * Wave 2) with the Wave 3 additions :
 *   - view toggle (list / map)
 *   - `SaveSearchButton` (account: save + optional alert ; visitor: alert without account, TCK-599)
 *   - canonical {@link PropertyCard} (owns favorites button)
 *
 * The underlying `useSearch` hook (reducer + URL sync) is untouched; it
 * already satisfies TCK-039 URL-sync AC.
 */

type View = 'list' | 'map';

/** Le début des résultats — là où la pagination ramène la vue (TCK-557). */
const ID_DES_RESULTATS = 'resultats';
/** Les premières cellules de la grille dont l'image est préchargée (`priority`, TCK-1036). */
const CARTES_PRIORITAIRES = 4;
/**
 * TCK-1276 (P102.02) — les premières cellules rendues sans état masqué : la première rangée de la
 * grille la plus large (`min-[112.5rem]:grid-cols-6`). Les images préchargées restent quatre.
 */
const CARTES_REVELEES = 6;

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
 * TCK-553 — le bas de la `nav` fixe du site public, MESURÉ, tant que `actif`.
 *
 * La vue carte mobile se cale dessous (AC3 : « toute la hauteur sous la `nav`, à 1 px près »). Une
 * constante n'y suffit pas, et c'est mesuré : la `nav` fait 71 px à 390, quand `NavbarSpacer` en
 * réserve 69 et la page en supposait 68. Sa hauteur suit son contenu (pastille de recherche
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

/** Le seuil `lg` de Tailwind. */
const LG_BREAKPOINT_PX = 1024;

/**
 * TCK-2499 / TCK-2500 — une cellule de la grille : un bien organique ou un emplacement sponsorisé,
 * inséré à la position que l'API a rendue.
 *
 * UN élément par bien : en densité « Liste », la carte se pose en LIGNE sous `md`
 * (`disposition="ligne-au-telephone"`, réglée en CSS) et reste la carte de bureau à partir de `md`,
 * où la liste est une grille à plusieurs colonnes. La cellule rendait la ligne ET la carte, l'une
 * masquée : ×2,35 nœuds à 390 px (revue adverse du 2026-11-09).
 *
 * Un emplacement porte le marqueur d'arrivée (`?src=sponsored`, TCK-794) et sa mention en TEXTE :
 * ruban « Sponsorisé » sur la carte, mention sobre dans la ligne (ADR-0061 §7).
 */
function CelluleDeLaListe({
  carte,
  index,
  densite,
  transactionFiltree,
}: {
  readonly carte: CarteDeLaListe;
  readonly index: number;
  readonly densite: Densite;
  readonly transactionFiltree?: SearchFilters['contract_type'];
}) {
  const sponsorise = carte.genre === 'sponsorise';
  const place = sponsorise ? 'sponsorise' : placementDe(carte.bien) === 'reserved' ? 'vedette' : undefined;

  return (
    <div data-emplacement={sponsorise ? 'sponsorise' : undefined} data-cellule={carte.genre}>
      <ArriveeSponsorisee value={sponsorise}>
        <PropertyCard
          property={carte.bien}
          index={index}
          priority={index < CARTES_PRIORITAIRES}
          revelee={index < CARTES_REVELEES}
          sizes={CARD_SIZES_SEARCH_GRID}
          disposition={densite === 'liste' ? 'ligne-au-telephone' : 'carte'}
          // TCK-2499 — un emplacement reçoit lui aussi la transaction filtrée : la carte ne la montre
          // que si elle en DIFFÈRE, et la lui taire posait « En location » sur sa photo, en plus du
          // favori et de « Sponsorisé » (deux éléments au plus sur une photo).
          transactionFiltree={transactionFiltree}
          // TCK-633 lot F → TCK-635 — une place payée porte sa robe, le Badge acheté passe sur la photo.
          robe={place}
          badge={badgeDe(carte.bien)}
        />
      </ArriveeSponsorisee>
    </div>
  );
}

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
  /**
   * TCK-916 (P35.02) — les liens de lieu construits par la page serveur (« Quartiers de
   * <ville> »), rendus à la fin de `<main>`. Ils arrivent tout faits : leur domaine vient du cache
   * de données du serveur, comme celui du sitemap.
   */
  readonly liensDeLieu?: React.ReactNode;
};

export function PropertiesDiscoveryPage({ titre, graine = null, liensDeLieu = null }: ProprietesDeLaListe = {}) {
  const t = useTranslations('search.results');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<View>('list');

  const {
    data,
    loading,
    enCours,
    error,
    filters,
    filtresDesResultats,
    activeCount,
    search,
    resetFilters,
    removeFilter,
    repli,
    retirerTerme,
    cleDesResultats,
  } = useSearch({ graine });
  const pathname = usePathname();
  // TCK-2499 — la densité du téléphone (« Liste » par défaut), mémorisée sur l'appareil.
  const densite = useDensite();

  const properties = data?.data ?? [];
  const meta = data?.meta;
  // TCK-2499 — « Voir N biens de plus » : les pages suivantes de la requête AFFICHÉE.
  const suite = useSuiteDeLaListe(error ? null : data, cleDesResultats);
  // TCK-2500 — la suite des cartes, page après page : chaque page insère SES emplacements à la
  // `position` que l'API rend (jamais recalculée ici). Hors pagination, hors `total` (ADR-0061 §7).
  // Pas d'emplacement en erreur, comme avant.
  // La suite CONTINUE : un bien n'y est montré qu'une fois, et la première page ne s'ouvre pas sur
  // l'emplacement de tête quand des places réservées l'ouvrent (`suiteDesPages`, revue de TCK-2499).
  const pagesAffichees = data ? [data, ...suite.pages] : [];
  const cartes = suiteDesPages(
    pagesAffichees.map((page) => ({
      numero: page.meta.current_page,
      organiques: page.data,
      sponsorises: error ? [] : lireEmplacements(page),
    })),
  );
  const derniereAffichee = pagesAffichees[pagesAffichees.length - 1];
  const biensAffiches = meta
    ? (meta.current_page - 1) * meta.per_page + pagesAffichees.reduce((n, page) => n + page.data.length, 0)
    : 0;
  const hrefSuivante = (() => {
    if (suite.pageSuivante === null) return null;
    const params = filtersToParams({ ...filters, page: suite.pageSuivante });
    if (data?.seed_hour) params.set('seed_hour', data.seed_hour);
    return `${pathname}?${params.toString()}`;
  })();

  // TCK-552 — à zéro résultat CONFIRMÉ (ni en chargement, ni en erreur), le tri et la bascule
  // n'agissent sur rien (E1) : ils ne sont pas rendus sous `lg`. Et la vue y retombe sur la
  // liste — sans quoi, la bascule masquée, un visiteur en vue carte y resterait enfermé devant
  // une carte vide, loin de l'état vide qui, lui, ne vit que dans la liste. Sous `lg` seulement :
  // le bureau garde ses onglets, donc sa sortie, et n'est pas modifié.
  const sousLg = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  const aucunResultat = !loading && !error && meta?.total === 0;
  const vue: View = aucunResultat && sousLg ? 'list' : view;
  // TCK-558 — l'état vide ne vit QUE dans la liste. Les puces et la sauvegarde ne quittent la barre
  // d'outils que là où il les rend : au bureau, la vue carte reste atteignable à zéro résultat,
  // et elle les perdait toutes les deux.
  const etatVideRendu = aucunResultat && vue === 'list';
  // TCK-2499 — une page au-delà de la dernière rend aussi `SearchEmpty` (total non nul) : le bandeau
  // de puces se tait là aussi — les critères ne sont pas en cause, l'issue est « Revenir au début ».
  const listeSansBien = !loading && !error && properties.length === 0;
  // TCK-2499 (revue) — au-delà de la dernière page, les chemins vers celles qui existent, filtres
  // gardés : « Voir N biens de plus » a remplacé la pagination numérotée qui les donnait.
  const hrefDeLaPage = (page: number | undefined) => {
    const qs = filtersToParams({ ...filters, page: page !== undefined && page > 1 ? page : undefined }).toString();
    return qs ? `/properties?${qs}` : '/properties';
  };
  const issuesDePage =
    listeSansBien && meta && meta.total > 0 && meta.current_page > meta.last_page
      ? { derniere: { numero: meta.last_page, href: hrefDeLaPage(meta.last_page) }, premiere: hrefDeLaPage(undefined) }
      : undefined;

  // TCK-553 — la rangée d'outils, où ramène le retour à la liste quand la recherche a changé.
  const rangeeOutilsRef = useRef<HTMLDivElement>(null);

  // TCK-553 — sous `lg`, la vue carte occupe l'écran (M2) : le titre, la rangée d'outils et le pied
  // de page s'effacent, et la carte se cale sous la `nav` mesurée. Filtres et le retour à la liste
  // passent par la pastille flottante (TCK-552), montrée d'emblée en vue carte.
  // TCK-2499 — mesuré sous `lg` dans les deux vues : la carte s'y cale, et les puces des filtres
  // s'y collent pendant le défilement de la liste.
  const basDeLaNav = useBasDeLaNav(sousLg);

  // TCK-553 (AC5) — la liste revient là où on l'a quittée. La vue carte mobile raccourcit le
  // document à la hauteur de l'écran, et le navigateur écrête alors le défilement à 0 : sans cette
  // mémoire, revenir à la liste repartait du haut, loin du bien qu'on regardait.
  //
  // ⚠ La position ne vaut que pour la liste qu'on a quittée. Sous `lg`, la pastille Filtres est le
  // seul accès aux filtres en vue carte : filtrer depuis la carte est un parcours courant. Restaurer
  // alors 1 800 px d'une liste qui n'est plus la même posait le visiteur au 13ᵉ résultat d'une
  // liste jamais vue — ou, sur 3 résultats, en plein pied de page (mesuré, refus du tour 1). La
  // recherche est donc mémorisée avec la position, sous sa forme canonique (`filtersToParams`, page
  // comprise) : changée, le retour se fait en TÊTE des nouveaux résultats, comme avant ce ticket.
  const signatureDeLaRecherche = filtersToParams(filters).toString();
  const listeQuittee = useRef<{ y: number; recherche: string } | null>(null);
  const retourARestaurer = useRef<{ genre: 'position'; y: number } | { genre: 'tete' } | null>(null);
  const changerDeVue = (prochaine: View) => {
    if (prochaine === vue) return;
    if (vue === 'list') {
      // TCK-551 — `positionVerticale()` et non `scrollY`, qui vaut 0 sous le verrou du menu mobile.
      listeQuittee.current = { y: positionVerticale(), recherche: signatureDeLaRecherche };
    } else {
      const quittee = listeQuittee.current;
      retourARestaurer.current =
        quittee && quittee.recherche === signatureDeLaRecherche
          ? { genre: 'position', y: quittee.y }
          : { genre: 'tete' };
    }
    setView(prochaine);
  };
  // Avant la peinture : la liste ne s'affiche jamais en haut pour sauter ensuite à sa position.
  useLayoutEffect(() => {
    const retour = retourARestaurer.current;
    if (vue !== 'list' || retour === null) return;
    retourARestaurer.current = null;
    if (retour.genre === 'position') window.scrollTo(0, retour.y);
    // `scroll-mt-20` : la rangée d'outils s'arrête sous la `nav` fixe, pas derrière elle.
    else rangeeOutilsRef.current?.scrollIntoView({ block: 'start' });
  }, [vue]);

  // TCK-335 — le retour arrière repartait du haut. En traversée d'historique, Next ne
  // reprend pas la main sur le défilement : c'est la restauration NATIVE qui opère, et
  // elle opère pendant que cette page rend ses 10 squelettes (`CardSkeleton` ci-dessous)
  // pour 30 résultats à venir. Un document au tiers de sa hauteur écrête 1 200 px à 0.
  // Le signal passé au hook est donc « le commit porte les résultats », c'est-à-dire la
  // retombée de `loading` — et non le montage. `loading` couvre les trois issues (résultats,
  // liste vide, erreur) : la hauteur du document est arrêtée dans chacune.
  //
  // TCK-2499 — et après la reprise des pages déjà chargées par « Voir N biens de plus » (AC3) : sans
  // elles, la position du 50ᵉ bien serait écrêtée sur un document qui n'en porte que 40.
  useScrollRestoration(!loading && suite.decidee);

  // TCK-335 — un 422 nomme le filtre en cause dans `errors.<champ>`. S'il en désigne
  // UN SEUL et qu'il appartient bien à `SearchFilters`, on propose de retirer celui-là
  // plutôt que d'effacer toute la recherche : l'utilisateur garde son travail.
  //
  // ⚠ On n'affiche JAMAIS la prose de validation du serveur ici : le libellé vient du
  // dictionnaire du front, comme le veut le principe non négociable n°5. La raison n'est
  // plus une traduction absente — mesuré à TCK-335, le 422 de `furnished` rendait de
  // l'anglais sous fr et wo, mais `lang/{fr,wo}/validation.php` portent la clé `boolean`
  // depuis TCK-536 (TCK-722). Elle est que la prose du serveur nomme le champ par sa clé
  // technique : « Le champ furnished doit être vrai ou faux. »
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

  // Le retrait d'UNE puce — celle de la barre d'outils comme celle de l'état vide (TCK-558) : un
  // seul chemin, valeurs multiples comprises.
  const retirerFiltre = (key: keyof SearchFilters, subKey?: string) => {
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
    } else if (key === 'cities' && subKey) {
      // P185.02 (TCK-2061) — les villes du profil : la puce retire SA ville, pas la liste.
      const next = (filters.cities ?? []).filter((v) => v !== subKey);
      handleFilterChange({
        cities: next.length > 0 ? next : undefined,
      });
    } else {
      removeFilter(key);
    }
  };

  // TCK-633 (lot E, AC6) — la carte reçoit TOUS les filtres du panneau, dérivés de la même URL que
  // la liste (`parametresDeLaCarte`) : un filtre ajouté au panneau n'a plus à être recopié ici.
  // Restent à la liste seule `q`, le tri, la pagination et son rectangle.
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
  const mapFilters = parametresDeLaCarte(filtersToParams(filters));

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />

      <NavbarSpacer />

      {/* TCK-628 — 1920 px au plus (1440 avant), comme la barre et l'accueil : au-delà de 1800 px
          la grille passe à six colonnes, de la largeur des cartes des rangées de l'accueil. */}
      <div className="max-w-[1920px] mx-auto px-4 md:px-8 lg:px-16 py-4 md:py-6">
        <div className="flex gap-6 items-start">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={resetFilters}
            activeCount={activeCount}
            filtresDesResultats={filtresDesResultats}
            enCours={enCours}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            total={enCours || error ? null : (meta?.total ?? 0)}
          />

          <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
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
            <SearchToolbar
              titre={
                titre?.trim() ? (
                  // TCK-552 — plus compact sous `md` (P6). TCK-635 — plus petit encore, et sur la
                  // ligne du compte et des outils au bureau. Le texte ne change pas (TCK-432).
                  // TCK-553 — en vue carte sous `lg`, le titre quitte l'écran mais PAS l'arbre
                  // d'accessibilité (`sr-only`, et non `hidden`) : la page garde son `<h1>`.
                  <h1
                    className={`font-display text-xl lg:text-2xl leading-[1.15] font-semibold text-foreground ${
                      vue === 'map' ? 'max-lg:sr-only' : ''
                    }`}
                  >
                    {titre}
                  </h1>
                ) : null
              }
              // TCK-553 (M3) — en vue carte, le compte de la LISTE n'est pas affiché : la carte
              // affiche le sien (`PropertyMap`, AC4). `/map` ne reçoit pas `q` et ne place pas un
              // bien sans coordonnées — deux nombres pour une recherche, c'était l'écran de M3.
              total={error || vue === 'map' ? null : (meta?.total ?? 0)}
              loading={enCours}
              filters={filters}
              activeCount={activeCount}
              onSortChange={(sort) => handleFilterChange({ sort })}
              onOpenSidebar={() => setSidebarOpen(true)}
              rangeeOutilsRef={rangeeOutilsRef}
              outilsMasquesSousLg={vue === 'map'}
              // TCK-552 — le tri n'agit ni sur la carte (`/map` n'en déclare aucun, cf.
              // `mapFilters`) ni sur une liste vide (M4, E1, AC8).
              afficherTri={vue === 'list' && !aucunResultat}
              // TCK-2499 — sous `lg`, la carte passe par la pastille flottante, toujours montrée : le
              // bout de rangée prend la densité (téléphone seulement : à partir de `md`, la liste est
              // une grille et la densité n'y change rien). Entre `md` et `lg`, la bascule de vue
              // reste là — la pastille la double, sans gêne.
              basculeDeVue={
                aucunResultat ? undefined : (
                  <>
                    <BasculeDeDensite densite={densite} className="md:hidden" />
                    <span className="max-md:hidden">
                      <BasculeDeVue view={vue} onChange={changerDeVue} />
                    </span>
                  </>
                )
              }
              vueBureau={<ViewToggle view={vue} onChange={changerDeVue} />}
              // TCK-635 — « Sauvegarder » sur la ligne du titre. Son libellé est conservé, et c'est
              // vérifié : `SaveSearchButton` envoie `notification_frequency: 'off'` — elle
              // SAUVEGARDE, elle ne crée aucune alerte (TCK-552, TCK-599). Sous `lg`, seulement
              // s'il y a un critère (P7) ; au bureau, toujours, et l'infobulle dit pourquoi elle
              // n'agit pas sans critère. TCK-558 — à zéro résultat, elle vit dans l'état vide.
              sauvegarde={
                etatVideRendu ? null : (
                  <SaveSearchButton
                    filters={filters}
                    activeCount={activeCount}
                    compact
                    className={activeCount > 0 ? '' : 'max-lg:hidden'}
                  />
                )
              }
            />

            <OutilsFlottantsDeListe
              // TCK-553 — en vue carte, la rangée d'outils n'est plus rendue sous `lg` : la pastille
              // est alors la SEULE sortie (et le seul accès aux filtres). Elle est montrée d'emblée.
              // TCK-2499 — sous `lg`, Filtres et Carte flottent EN PERMANENCE au-dessus de la barre
              // d'onglets (une pastille, jamais une deuxième barre). Pas à zéro résultat : la vue y
              // retombe sur la liste et l'état vide porte ses propres issues (TCK-552, E1).
              visible={!sidebarOpen && (vue === 'map' || !aucunResultat)}
              activeCount={activeCount}
              vue={vue}
              onOuvrirFiltres={() => setSidebarOpen(true)}
              // TCK-553 — le vieux `scrollIntoView` vers la rangée d'outils n'a plus d'objet : la
              // carte mobile est plein écran, posée sous la `nav` quel que soit le défilement, et
              // le retour à la liste restaure SA position (AC5, `changerDeVue`).
              onBasculerVue={() => changerDeVue(vue === 'list' ? 'map' : 'list')}
            />

            {/*
              TCK-2499 — les filtres actifs en puces retirables, au-dessus des résultats. Sous `lg`,
              collées sous la `nav` (mesurée) pendant le défilement, sur UNE ligne qui défile de côté :
              on retire un critère sans remonter. L'état vide les rend lui-même (TCK-558).
            */}
            {vue === 'list' && !etatVideRendu && !listeSansBien && activeCount > 0 ? (
              <div
                data-puces-collees
                className="max-lg:sticky max-lg:top-[var(--bas-de-la-nav,69px)] z-30 -mx-4 mb-1 bg-surface px-4 py-1.5 md:-mx-8 md:px-8 lg:mx-0 lg:mb-5 lg:px-0 lg:py-0"
                style={
                  basDeLaNav === null
                    ? undefined
                    : ({ '--bas-de-la-nav': `${basDeLaNav}px` } as React.CSSProperties)
                }
              >
                <PucesDeFiltres
                  filters={filters}
                  filtresDesResultats={filtresDesResultats}
                  onRemoveFilter={retirerFiltre}
                  aria-label={t('puces.aria')}
                  className="max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[&>*]:shrink-0 max-lg:[&>*]:whitespace-nowrap"
                />
              </div>
            ) : null}

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

                {/*
                  TCK-580 — l'annonce du chargement, là où l'œil attend les biens. Rendue seulement
                  quand des biens sont DÉJÀ à l'écran : sans eux, ce sont les squelettes qui parlent
                  (design-guidelines § États : jamais de spinner plein écran).
                */}
                {enCours && !(loading && properties.length === 0) ? <ActualisationDesResultats /> : null}

                {/* TCK-946 — le titre de la grille, pour le seul arbre d'accessibilité : sans lui, le
                    `<h1>` de la liste menait droit au `<h3>` de la première carte (axe,
                    `heading-order`). Le compte et le titre visibles sont déjà sur la ligne du haut. */}
                <h2 className="sr-only">{t('heading')}</h2>

                {/* TCK-557 — la pagination ramène la vue ICI, sous la `nav` fixe (cf. `NavbarSpacer`). */}
                <div
                  id={ID_DES_RESULTATS}
                  aria-busy={enCours}
                  data-actualisation={enCours ? 'en-cours' : undefined}
                  // TCK-580 — la grille s'estompe DÈS le clic, plus seulement pendant le `fetch` :
                  // `enCours` couvre aussi l'aller-retour de navigation, qui ne montrait rien.
                  // `saturate` en plus de l'opacité : des photos à moitié transparentes gardaient
                  // leurs couleurs et se lisaient encore comme des résultats valides.
                  // TCK-628 — 1800 px s'écrit `min-[112.5rem]`, pas `min-[1800px]` : Tailwind 4
                  // range un palier en px AVANT les paliers en rem, et `2xl:grid-cols-5` l'écrasait
                  // (mesuré : 5 colonnes à 1920).
                  // TCK-2499 — en densité « Liste », sous `md`, des lignes serrées séparées d'un filet.
                  data-densite={densite}
                  className={`scroll-mt-[85px] lg:scroll-mt-[152px] grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[112.5rem]:grid-cols-6 gap-x-4 gap-y-8 transition-[opacity,filter] duration-300 ease-out ${
                    densite === 'liste' && cartes.length > 0 ? 'max-md:gap-y-0 max-md:divide-y max-md:divide-border' : ''
                  } ${
                    enCours
                      ? 'opacity-45 saturate-[0.35] pointer-events-none'
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
                    <SearchEmpty
                      filters={filters}
                      filtresDesResultats={filtresDesResultats}
                      activeCount={activeCount}
                      criteresEnCause={aucunResultat}
                      onRemoveFilter={retirerFiltre}
                      onReset={resetFilters}
                      issuesDePage={issuesDePage}
                    />
                  ) : (
                    cartes.map((carte, i) => (
                      <CelluleDeLaListe
                        key={`${carte.genre}-${carte.page}-${carte.bien.id}`}
                        carte={carte}
                        index={i}
                        densite={densite}
                        transactionFiltree={filters.contract_type}
                      />
                    ))
                  )}
                </div>

                {/*
                  TCK-2499 — « Voir N biens de plus » remplace la pagination numérotée : on poursuit
                  sa lecture sans changer de page, et le retour depuis une fiche ramène les biens déjà
                  chargés (cf. `useSuiteDeLaListe`). Une URL qui ouvre une page au-delà de la première
                  (lien hérité, robot) garde un chemin vers le début. La taille de page reste au
                  bureau, à côté (TCK-635).
                */}
                {meta && cartes.length > 0 && !error ? (
                  <div data-pied-de-liste className="lg:relative">
                    {meta.current_page > 1 ? (
                      <p className="pt-8 text-center">
                        <LienLocalise
                          href={hrefDeLaPage(undefined)}
                          className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary"
                        >
                          {t('voirPlus.debut')}
                        </LienLocalise>
                      </p>
                    ) : null}
                    <VoirPlus
                      total={derniereAffichee?.meta.total ?? meta.total}
                      affiches={biensAffiches}
                      parPage={meta.per_page}
                      href={hrefSuivante}
                      chargement={suite.chargement}
                      erreur={suite.erreur}
                      onVoirPlus={suite.voirPlus}
                    />
                    {meta.last_page > 1 ? (
                      <TailleDePage
                        filters={filters}
                        onPerPageChange={(per_page) => handleFilterChange({ per_page })}
                        className="lg:absolute lg:right-0 lg:bottom-0"
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            {liensDeLieu}
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
