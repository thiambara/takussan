'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, useTransition } from 'react';
import { Logo } from '@/components/brand/Logo';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { LienEvitement } from '@/components/shared/LienEvitement';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronUp, Building2, PlusCircle, HelpCircle, Search, Loader2, MapPin } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import { SelecteurDeTransaction, type Transaction } from '@/components/search/SelecteurDeTransaction';
import { ouvrirLeClavierDansLeGeste } from '@/components/search/clavierDansLeGeste';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { categories, moreCategories } from '@/data/navigation';
import { ICONES_DE_CATEGORIE as iconMap } from '@/components/home/icones-de-categorie';
import { useAuth } from '@/context/AuthContext';
import { BarreDeChargement } from '@/components/shared/BarreDeChargement';
import { hrefConnexion } from '@/components/auth/lien-connexion';
import { FavoritesPopover } from '@/components/favorites/FavoritesPopover';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { referentielPublicQueryKeys, UNE_HEURE_MS } from '@/lib/queries/referentiel-public';
import { parametreDe } from '@/types/search';
import { retenirRecherche } from '@/lib/recherches-recentes';
import { hrefLocalise, localeDuChemin } from '@/i18n/navigation';
import { decouperLocale } from '@/i18n/routing';
import type { Locale } from '@/i18n/config';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { cn } from '@/lib/utils';
import { voitLePortefeuille } from '@/lib/navigation/acces-app';
import { estPageDeDecouverte } from '@/lib/navigation/barre-publique';
import { MenuMonEspace } from '@/components/navigation-publique/MenuMonEspace';
import { PastilleCredits } from '@/components/credits/PastilleCredits';

type PropertyTypeCountsResponse = {
  data: Array<{ value: string; count: number }>;
};

/** `/properties` ou `/fr/properties` — la liste des biens, jamais une fiche (`/properties/<slug>`). */
function estListeDesBiens(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (localeDuChemin(pathname)) segments.shift();
  return segments.length === 1 && segments[0] === 'properties';
}

export interface NavbarProps {
  readonly className?: string;
}

/**
 * TCK-633 (lot E) — la sélection de types après un clic sur une puce de catégorie.
 *
 * Deux types ou plus (posés dans le panneau de filtres) : la puce AJOUTE ou RETIRE le sien, elle
 * n'écrase plus la sélection. Aucun ou un seul : mono-sélection, comme avant — la puce remplace,
 * ou retire si elle était la seule.
 */
export function prochaineSelectionDeTypes(selection: readonly string[], type: string): string[] {
  if (selection.length >= 2) {
    return selection.includes(type) ? selection.filter((t) => t !== type) : [...selection, type];
  }
  return selection.length === 1 && selection[0] === type ? [] : [type];
}

export function Navbar({ className }: NavbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  // TCK-568 (M2) — « Connexion » emporte la page courante et ses filtres en `?redirect=` : se
  // connecter depuis une recherche y ramène, au lieu de toujours mener à `/app`.
  const requete = searchParams.toString();
  const lienConnexion = hrefConnexion(requete ? `${pathname}?${requete}` : pathname);
  const locale = useLocale() as Locale;
  const t = useTranslations('nav');
  const tPublique = useTranslations('navigationPublique');
  const tCategories = useTranslations('property.types');
  const tCommon = useTranslations('common');
  // Le champ montre la recherche EN VIGUEUR sur la liste des biens — rechargement compris — et
  // reste modifiable. Ailleurs, `q` appartient à un autre index (`/agents`, `/agencies`) : il n'a
  // pas à apparaître dans la recherche de biens, ni à y être emporté.
  const surLaListe = estListeDesBiens(pathname);
  const qEnVigueur = surLaListe ? (searchParams.get(parametreDe('q')) ?? '') : '';
  const [location, setLocation] = useStateSyncedWith(qEnVigueur);
  // TCK-549 — la pastille mobile RÉSUME la recherche en vigueur : le lieu d'abord (le terme saisi,
  // sinon le quartier ou la ville choisis dans les suggestions), puis la transaction. Hors de la
  // liste, ces paramètres appartiennent à un autre index : la pastille reste au repos.
  const lieuEnVigueur = surLaListe
    ? (qEnVigueur || searchParams.get(parametreDe('location')) || searchParams.get(parametreDe('city')) || '')
    : '';
  const transactionEnVigueur = surLaListe ? searchParams.get(parametreDe('contract_type')) : null;
  const libelleTransaction =
    transactionEnVigueur === 'sale' ? t('searchPill.sale')
      : transactionEnVigueur === 'rent' ? t('searchPill.rent')
        : null;
  // La saisie mobile : un tap sur la pastille ouvre un écran de saisie, et rien d'autre — ouvrir
  // puis fermer sans valider ne touche pas à l'URL (la pastille relançait la recherche et perdait
  // `page`, audit du 2026-09-22).
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const zoneSaisieRef = useRef<HTMLDivElement>(null);
  const basculerRecherche = useCallback((ouverte: boolean) => {
    // `location` repart de la recherche EN VIGUEUR à l'ouverture ET à la fermeture sans
    // validation (Échap, « Retour », clic dehors — la validation, elle, ferme par
    // `setRechercheOuverte` et ne passe pas ici). `location` est un état caché une fois la saisie
    // refermée, et `buildSearchUrl` le lit : sans cette remise, une puce de catégorie (celle de
    // la barre de bureau ; le menu mobile n'en porte plus depuis TCK-551) écrivait en `q` un texte
    // que le visiteur avait abandonné (refus du tour 1 de TCK-549, mesuré au navigateur :
    // `?q=Ngor+Plateau&type=apartment`).
    setLocation(qEnVigueur);
    setRechercheOuverte(ouverte);
  }, [qEnVigueur, setLocation]);
  // Le choix « Acheter | Louer » part de la transaction EN VIGUEUR sur la liste (comme le champ et
  // la pastille mobile), et un second appui le retire : `''` écrit une URL sans `contract_type`.
  const [transaction, setTransaction] = useStateSyncedWith<Transaction>(
    transactionEnVigueur === 'sale' || transactionEnVigueur === 'rent' ? transactionEnVigueur : '',
  );
  const libellesTransaction = { groupe: t('transactionPlaceholder'), sale: t('buy'), rent: t('rent') };
  const transactionImposee = { [parametreDe('contract_type')]: transaction };
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // La sélection vient de l'URL — source unique, partagée avec le panneau de filtres de
  // /properties. TCK-633 : chaque puce dont le type est sélectionné s'allume, sélection multiple
  // comprise (elles restaient toutes éteintes, et la barre semblait ignorer la sélection).
  const selectedTypes = useMemo(() => {
    const raw = searchParams.get('type');
    return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  }, [searchParams]);

  // Retour d'administration du 2026-09-16 : un clic sur une catégorie ne changeait RIEN à l'écran
  // tant que la page suivante n'était pas servie — la puce ne s'allumait qu'avec la nouvelle URL,
  // et le seul indicateur était en bas de page. La navigation passe donc par une transition : la
  // puce demandée s'allume au clic, et la barre de chargement court sous la navbar tant que la
  // page n'est pas là. `demande` porte la puce cliquée et la sélection qu'elle demande (vide : retrait).
  const [enNavigation, demarrerNavigation] = useTransition();
  const [demande, setDemande] = useState<{ readonly cliquee: string; readonly selection: readonly string[] } | null>(null);
  // Les types que la barre ALLUME : la sélection demandée tant que la page suivante n'est pas là,
  // puis celle de l'URL.
  const typesActifs: readonly string[] = enNavigation && demande !== null ? demande.selection : selectedTypes;
  const activeCategory = typesActifs.length === 1 ? (typesActifs[0] ?? null) : null;
  const moreHasActive = moreCategories.some((c) => c.type !== null && typesActifs.includes(c.type));
  // TCK-580 — la catégorie dont la navigation COURT (`undefined` : aucune). Distincte de
  // `activeCategory`, qui retombe sur l'URL : c'est elle qui porte l'indicateur de chargement.
  const categorieEnAttente: string | null | undefined =
    enNavigation && demande !== null ? (demande.selection.length > 0 ? demande.cliquee : null) : undefined;
  const plusEnAttente =
    categorieEnAttente !== undefined && moreCategories.some((c) => c.type === categorieEnAttente);

  // TCK-1229 (P103.04) — les comptes du menu « Plus », demandés à sa PREMIÈRE ouverture seulement :
  // la barre les demandait à chaque montage, sur toutes les pages, pour un menu fermé par défaut et
  // absent sous 1 024 px. D'ici là, et sur un échec, le menu se rend sans comptes.
  const [plusOuvertUneFois, setPlusOuvertUneFois] = useState(false);
  const { data: typeCounts } = useQuery({
    queryKey: referentielPublicQueryKeys.typesDeBien(),
    queryFn: async () => {
      const res = await apiFetch<PropertyTypeCountsResponse>('/public/property-types');
      const map: Record<string, number> = {};
      for (const entry of res.data) map[entry.value] = entry.count;
      return map;
    },
    enabled: plusOuvertUneFois,
    staleTime: UNE_HEURE_MS,
  });

  // Close more dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    // Échap referme le menu « Plus », fait main, sans primitive qui le porte (revue design du
    // 2026-09-16). Le menu « Mon espace » (TCK-2494) est un `DropdownMenu` : Échap, l'appui dehors et
    // le retour du focus sont ceux de la primitive.
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setMoreOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // TCK-2494 (ADR-0091 §5) — la rangée de catégories ne reste que sur les pages de DÉCOUVERTE
  // (l'accueil, la liste) : elle quitte la fiche et les pages d'outils, où elle ne filtrait rien.
  const surUnePageDeDecouverte = estPageDeDecouverte(pathname);
  // Louer · Acheter · Agences : la transaction de la liste en vigueur allume son lien.
  const { chemin: cheminSansLangue } = decouperLocale(pathname);
  const lienActif: 'louer' | 'acheter' | 'agences' | null = cheminSansLangue.startsWith('/agencies')
    ? 'agences'
    : surLaListe && transactionEnVigueur === 'rent'
      ? 'louer'
      : surLaListe && transactionEnVigueur === 'sale'
        ? 'acheter'
        : null;

  // TCK-254 — `Publier` is universal: everyone sees the CTA, and `/publish` resolves where to send
  // the user. TCK-625 — le drapeau `publishIntent` posé au clic n'était relu par personne : le
  // retour d'OAuth porte déjà la destination (`intentionOAuthMemorisee`), il est retiré.

  // ─── Navigation helpers ─────────────────────────────────────────────────────

  /**
   * L'UNIQUE constructeur d'URL de recherche de la navbar — TCK-439.
   *
   * ⚠ Il y en avait DEUX, et c'est ce qui a produit le défaut : ce constructeur-ci écrivait
   * `q` (recherche plein-texte), `handleCategoryClick` écrivait `city` (égalité sur la ville),
   * à vingt-six lignes de distance et **à partir de la même valeur `location`**. Un visiteur qui
   * tapait « villa avec piscine » puis cliquait la puce « Villa » voyait sa saisie devenir une
   * ville de ce nom : zéro résultat, sans un mot d'explication — et le repli conjonctif de
   * TCK-338, qui raisonne sur les termes de `q`, ne pouvait ni l'élargir ni l'étiqueter.
   *
   * **Le champ a UN sens : plein-texte.** Ce n'est pas un arbitrage par défaut, c'est la voie que
   * le ticket décrit comme la plus juste, et elle était déjà à moitié livrée : `SearchAutocomplete`
   * distingue déjà « ville choisie dans la liste » (elle écrit `city`, et efface `location`) de
   * « texte libre » (elle écrit `q`). La navbar n'a jamais à deviner : ce qu'elle tient dans
   * `location` est, par construction, du texte que personne n'a choisi dans une liste.
   *
   * Les noms de paramètres passent par `parametreDe()` : un littéral de moins, et surtout un nom
   * qui ne peut plus diverger de celui que `SEARCH_FILTER_KEYS` déclare.
   */
  const buildSearchUrl = useCallback((overrides: Record<string, string> = {}) => {
    // Preserve any sidebar filter already in the URL
    const params = new URLSearchParams(searchParams.toString());
    // La transaction choisie — `''` la retire : le sélecteur part de celle de l'URL.
    if (transaction) params.set(parametreDe('contract_type'), transaction);
    else params.delete(parametreDe('contract_type'));
    // free text from the searchbox maps to full-text search; selecting a
    // city/neighborhood suggestion still writes the dedicated location params.
    // Le champ étant prérempli par `q`, un champ VIDÉ est une demande de le retirer.
    if (location.trim()) params.set(parametreDe('q'), location.trim());
    else params.delete(parametreDe('q'));
    // active category → type filter (only override if set)
    if (activeCategory) params.set(parametreDe('type'), activeCategory);
    // reset pagination on new search
    params.delete(parametreDe('page'));
    // apply explicit overrides last
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === '') params.delete(k); else params.set(k, v);
    });
    const qs = params.toString();
    // Le préfixe de langue est posé ICI et non laissé au proxy : `router.push` n'est pas un
    // `LienLocalise`, et un chemin nu coûterait un aller-retour 307 sur le geste le plus
    // fréquent du site (ADR-0026). `useSearch` est déjà correct par construction — il repart
    // de `usePathname()`, qui porte la langue.
    return hrefLocalise(`/properties${qs ? '?' + qs : ''}`, locale);
  }, [searchParams, transaction, location, activeCategory, locale]);

  const handleSearch = useCallback(() => {
    setDemande(null);
    const href = buildSearchUrl();
    // TCK-2475 — la loupe est un geste de recherche comme Entrée : il entre dans les récentes de
    // l'appareil que la barre propose au focus d'un champ vide (rien ne part au serveur).
    retenirRecherche({ texte: location.trim(), qs: href.split('?')[1] ?? '' });
    demarrerNavigation(() => router.push(href));
  }, [router, buildSearchUrl, location]);

  const handleCategoryClick = useCallback((type: string | null) => {
    if (!type) return;
    // TCK-633 — une sélection MULTIPLE n'est plus écrasée (`prochaineSelectionDeTypes`) ; seule ou
    // sans sélection, la puce reste mono-sélection.
    //
    // Une puce AJOUTE un critère, elle ne réinterprète pas la saisie : tout le reste de l'URL
    // — `q` compris — vient de `buildSearchUrl`, qui est désormais le seul à l'écrire.
    const selection = prochaineSelectionDeTypes(selectedTypes, type);
    setDemande({ cliquee: type, selection });
    demarrerNavigation(() => router.push(buildSearchUrl({ [parametreDe('type')]: selection.join(',') })));
  }, [router, buildSearchUrl, selectedTypes]);

  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-background border-b border-border ${className || ''}`}
      // Nommé : au téléphone, la barre du bas est un second repère (« Navigation principale »), et
      // deux `navigation` dont un sans nom ne se distinguent pas au lecteur d'écran (revue TCK-2493).
      // `className` reste en tête : `ChatWidget.test.tsx` (TCK-2485) y lit le z de la barre.
      aria-label={tPublique('entete.navLabel')}
    >
      {/* TCK-905 (P31.04) — premier élément focalisable de la page : sans lui, 18 Tab
          traversaient la barre avant le contenu. Chaque page qui monte la barre pose la cible
          sur son `<main>` (`Navbar.lien-evitement.test.tsx`). */}
      <LienEvitement />
      {/* TCK-551 (N7) — `px-4` sous `sm`, la gouttière du contenu des pages sur téléphone (logo à
          x = 24 contre 16 pour le `<h1>` de `/properties`, mesuré à 360 et 390) ; `px-6` dès `sm`,
          comme avant. Les pages qui montent la barre sont en `px-4` sous `sm` elles aussi :
          `Navbar.gouttiere.test.tsx` le garde.
          TCK-628 — 1920 px au plus (1440 avant), gouttière inchangée : la barre suit le conteneur
          de l'accueil et de la liste, qui s'élargissent pour montrer plus de cartes. Restée à
          1440, son logo serait à 264 px du bord à 1920 quand la première carte est à 24. */}
      <div className="flex items-start gap-4 px-4 sm:px-6 py-3 max-w-[1920px] mx-auto">
        {/* Logo */}
        <LienLocalise href="/" className="shrink-0 mt-2.5 hover:opacity-80 transition-opacity">
          <Logo nom={tCommon('appName')} nomVisible="des-sm" />
        </LienLocalise>

        {/* TCK-2494 (ADR-0091 §5) — Louer · Acheter · Agences : Agences n'était atteignable que par le
            pied de page. Le lien actif se lit par un trait ET `aria-current`, jamais la seule teinte.
            Une liste et non un second `<nav>` : la barre entière est déjà le repère de navigation. */}
        <ul className="hidden lg:flex h-[52px] shrink-0 items-center gap-5 xl:gap-6">
          {(
            [
              ['louer', `/properties?${parametreDe('contract_type')}=rent`],
              ['acheter', `/properties?${parametreDe('contract_type')}=sale`],
              ['agences', '/agencies'],
            ] as const
          ).map(([cle, href]) => (
            <li key={cle}>
              <LienLocalise
                href={href}
                aria-current={lienActif === cle ? 'page' : undefined}
                className={cn(
                  'relative py-2 text-[15px] font-medium whitespace-nowrap transition-colors',
                  lienActif === cle
                    ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tPublique(`entete.${cle}`)}
              </LienLocalise>
            </li>
          ))}
        </ul>

        {/* Center column: Search bar + Categories stacked, left-aligned — desktop.
            TCK-505 (#2) — la mise en page de bureau attend `lg` : son contenu mesure 869 px, et à
            768 « Publier » sortait du viewport. Entre 768 et 1023 c'est la barre mobile, qui tient.
            TCK-628 — `min-w-0` : sans lui, le minimum automatique de la colonne est la largeur de la
            bande de catégories, qui ne défile donc jamais — à 1024, c'est « Publier » qui sortait. */}
        <div className="hidden lg:flex flex-col max-w-xl w-full min-w-0 mx-auto gap-0">
          {/* Search Bar — `Accueil.dc.html` : épingle de lieu, champ, « Acheter | Louer » segmenté,
              loupe ronde de 40 px, dans une pilule de 52 px.
              TCK-731 — l'anneau de focus du champ passe sur CETTE pilule, la seule visible : celle
              du champ est aplatie ci-dessous (`ring-0` compris), et le sélecteur et la loupe ont
              le leur, d'où `has-[input:focus-visible]` et non `focus-within`. */}
          <div className="flex h-[52px] items-center gap-2 bg-card border border-border rounded-full pl-1 pr-1.5 shadow-[0_1px_2px_color-mix(in_srgb,var(--shadow-color)_6%,transparent)] hover:shadow-md transition-shadow has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring">
            <SearchAutocomplete
              variant="hero"
              icone={MapPin}
              imposer={transactionImposee}
              placeholder={t('searchPlaceholder')}
              className="flex-1 min-w-0 [&>div:first-child]:border-none [&>div:first-child]:shadow-none [&>div:first-child]:ring-0 [&>div:first-child]:rounded-none [&>div:first-child]:bg-transparent [&>div:first-child>svg]:size-[18px] [&_input]:text-[15px] [&_input]:font-normal"
              value={qEnVigueur}
              onQueryChange={(v) => setLocation(v)}
            />
            {/* TCK-2494 — dès `xl` seulement : sous lui, Louer · Acheter de l'en-tête portent le même
                choix, et l'en-tête d'une ligne doit tenir à 1024 sans déborder (AC4). */}
            <SelecteurDeTransaction
              valeur={transaction}
              onChange={setTransaction}
              libelles={libellesTransaction}
              className="hidden xl:grid"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="grid size-10 place-items-center bg-primary hover:bg-primary/90 text-primary-foreground rounded-full transition-[background-color,scale] active:scale-[0.96] shrink-0"
              aria-label={t('searchAria')}
            >
              <Search className="size-[18px]" aria-hidden="true" />
            </button>
          </div>

          {/* Category strip — TCK-628 : huit types visibles, puis « Plus ». Les huit défilent dans
              leur propre conteneur quand la colonne est trop étroite (1024 px, ou un libellé plus
              long dans une autre langue) ; « Plus » en reste DEHORS, parce qu'un `overflow-x-auto`
              rogne aussi en hauteur — le menu déroulant qu'il ouvre y serait coupé. */}
          {surUnePageDeDecouverte ? (
          <div className="flex items-center gap-0 -ml-2">
            <div className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((cat) => {
                const Icon = iconMap[cat.icon] || Building2;
                const isActive = cat.type !== null && typesActifs.includes(cat.type);
                const enAttente = categorieEnAttente === cat.type;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat.type)}
                    aria-pressed={isActive}
                    aria-busy={enAttente || undefined}
                    className={`flex shrink-0 flex-col items-center gap-1 px-1.5 xl:px-2.5 py-2 border-b-2 rounded-t-lg transition-colors duration-150 ${isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    {/* TCK-580 — le pictogramme cède sa place au chargement, à gabarit égal : la
                        catégorie cliquée dit « c'est pris » sans que la bande ne bouge. */}
                    {enAttente ? (
                      <Loader2 data-attente="categorie" className="w-[18px] h-[18px] animate-spin" aria-hidden />
                    ) : (
                      <Icon className="w-[18px] h-[18px]" />
                    )}
                    <span className="text-xs font-semibold whitespace-nowrap">{tCategories(cat.nameKey)}</span>
                  </button>
                );
              })}
            </div>

            {/* More dropdown button */}
            <div className="relative shrink-0" ref={moreRef}>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen((o) => !o);
                  setPlusOuvertUneFois(true);
                }}
                aria-expanded={moreOpen}
                className={`flex flex-col items-center gap-1 px-1.5 xl:px-2.5 py-2 border-b-2 rounded-t-lg transition-colors duration-150 ${moreHasActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                aria-label={t('moreTypes')}
              >
                {plusEnAttente ? (
                  <Loader2 data-attente="categorie" className="w-[18px] h-[18px] animate-spin" aria-hidden />
                ) : moreOpen ? (
                  <ChevronUp className="w-[18px] h-[18px]" />
                ) : (
                  <PlusCircle className="w-[18px] h-[18px]" />
                )}
                <span className="text-xs font-semibold whitespace-nowrap">{t('more')}</span>
              </button>

              {moreOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-popover rounded-2xl shadow-lg border border-border p-2 z-50 grid grid-cols-2 gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  {moreCategories.map((cat) => {
                    const Icon = iconMap[cat.icon] || HelpCircle;
                    const isActive = cat.type !== null && typesActifs.includes(cat.type);
                    const count = cat.type ? typeCounts?.[cat.type] : undefined;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setMoreOpen(false);
                          handleCategoryClick(cat.type);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold leading-none truncate">{tCategories(cat.nameKey)}</p>
                          {count !== undefined && (
                            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{t('propertiesCount', { count })}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          ) : null}
        </div>

        {/* Actions — desktop. TCK-2494 (ADR-0091 §5) — favoris, compte (« Mon espace » connecté, « Se
            connecter » sinon) et « Publier un bien », toujours dans l'en-tête — y compris pour un pro,
            qui le retrouve aussi en tête de son menu (décision du porteur, 2026-11-08). La langue
            quitte l'en-tête : elle est dans « Mon espace » et dans le pied de page. */}
        <div className="hidden lg:flex items-center gap-2 shrink-0 ml-auto mt-1.5">
          <FavoritesPopover />
          {isLoading ? (
            <div className="h-10 w-32 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <>
              {/* TCK-642 — le solde de l'espace actif, à côté de l'appel à publier qu'il finance. Dès
                  `xl` : à 1024, l'en-tête d'une ligne n'a pas la place (AC4 de TCK-2494). */}
              {voitLePortefeuille(user.roles) ? <PastilleCredits ton="clair" className="hidden xl:inline-flex" /> : null}
              <MenuMonEspace user={user} />
            </>
          ) : (
            <LienLocalise
              href={lienConnexion}
              className="inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              {t('login')}
            </LienLocalise>
          )}
          <LienLocalise
            href="/publish"
            className="inline-flex min-h-10 items-center px-4 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary transition-[background-color,scale] active:scale-[0.96] whitespace-nowrap"
          >
            {tPublique('entete.publier')}
          </LienLocalise>
        </div>

          {/* Mobile : la pastille OUVRE une saisie (TCK-549).
              TCK-505 (#3) — `min-w-0` sur la rangée ET sur la pastille. Un enfant flex garde
              `min-width: auto`, la largeur de son contenu : la rangée, mesurée à 400 px sur un
              viewport de 390, poussait le bouton menu hors champ. Posé sur la pastille seule, le
              défaut restait entier (mesuré) — c'est la rangée que le conteneur externe doit
              pouvoir compresser. Les libellés, eux, tronquent : `truncate` rend leur `overflow`
              non visible, donc leur minimum flex tombe à 0 sans autre classe.
              TCK-549 — `px-3` et non `px-4` : à 360 px la pastille laisse 67 px au texte, et le
              libellé court le plus long (« Chercher ») en mesure 60. */}
          <div className="flex lg:hidden min-w-0 flex-1 items-center gap-2">
            <Sheet open={rechercheOuverte} onOpenChange={basculerRecherche}>
              {/* TCK-563 (M3, retour testeur du 2026-09-23) — la pastille est un conteneur de
                  requête (`@container`). La capture du testeur est prise à 320 px CSS (iPhone en
                  zoom d'affichage) : la pastille y mesure 93 px et le libellé AU REPOS se coupait
                  (« Cherc… », 43 px visibles sur 60, mesuré). Sous 5,5 rem de contenu, le libellé
                  au repos passe en `sr-only` — il reste le nom accessible — et la loupe se
                  centre (sauf si une transaction s'affiche dessous) ; `gap-0` avec, sans quoi
                  l'écart vers le libellé devenu invisible la décalait de 4 px (mesuré). Un lieu
                  en vigueur, lui, reste affiché et tronqué : c'est la donnée du visiteur, pas un
                  libellé. Le seuil couvre le plus long libellé des trois langues (« Chercher »,
                  60 px + loupe 16 + écart 8 = 84) ; à 360 et au-delà (107 px de contenu), rien
                  ne change. */}
              {/* TCK-563 (M3, décision du porteur du 2026-09-24) — la pastille RESTE dans la barre
                  (compacité, TCK-549), et un appui ouvre la saisie clavier prêt, du premier coup :
                  base-ui ne focalise le champ qu'une image après le geste, hors de lui, et Safari
                  iOS n'ouvre alors pas le clavier. Cf. `ouvrirLeClavierDansLeGeste`. */}
              <SheetTrigger
                aria-haspopup="dialog"
                onClick={() => { if (!rechercheOuverte) ouvrirLeClavierDansLeGeste(); }}
                className="@container flex-1 min-w-0 flex min-h-11 items-center bg-card border border-border rounded-full px-3 py-1 shadow-sm text-left transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-md"
              >
                <span
                  data-slot="contenu-pastille"
                  className={cn('flex w-full min-w-0 items-center gap-2', !lieuEnVigueur && !libelleTransaction && '@max-[5.5rem]:justify-center @max-[5.5rem]:gap-0')}
                >
                  <Search className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        'truncate text-sm',
                        lieuEnVigueur ? 'font-medium text-foreground' : 'text-muted-foreground',
                        !lieuEnVigueur && '@max-[5.5rem]:sr-only',
                      )}
                    >
                      {lieuEnVigueur || t('searchPill.idle')}
                    </span>
                    {libelleTransaction && (
                      <span className="truncate text-xs text-muted-foreground">{libelleTransaction}</span>
                    )}
                  </span>
                </span>
              </SheetTrigger>
              <SheetContent
                side="top"
                initialFocus={() => zoneSaisieRef.current?.querySelector<HTMLInputElement>('input') ?? true}
                className="lg:hidden h-dvh max-h-dvh bg-background"
              >
                <div className="flex items-center gap-1 border-b border-border px-2 py-2">
                  <SheetClose
                    aria-label={t('searchSurface.back')}
                    render={<Button variant="ghost" size="icon" className="size-11 rounded-full" />}
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </SheetClose>
                  <SheetTitle className="font-display tracking-tight">{t('searchSurface.title')}</SheetTitle>
                </div>
                {/* Le champ est celui de la barre de bureau — même autocomplétion, mêmes URL. Il
                    passe en 16 px : sous cette taille, Safari iOS zoome la page au focus. */}
                <div ref={zoneSaisieRef} className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <SearchAutocomplete
                    variant="hero"
                    icone={MapPin}
                    imposer={transactionImposee}
                    placeholder={t('searchPlaceholder')}
                    className="[&_input]:text-base"
                    value={qEnVigueur}
                    onQueryChange={(v) => setLocation(v)}
                    onValider={() => setRechercheOuverte(false)}
                  />
                  <SelecteurDeTransaction
                    valeur={transaction}
                    onChange={setTransaction}
                    libelles={libellesTransaction}
                    className="mt-3 w-full [&>button]:h-11"
                  />
                  <Button
                    type="button"
                    onClick={() => { setRechercheOuverte(false); handleSearch(); }}
                    className="mt-4 w-full rounded-full h-11 text-sm font-semibold"
                  >
                    {t('search')}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          {/* TCK-2493 (ADR-0091) — ni cœur ni menu hamburger sous `lg` : la barre d'onglets publique
              porte Favoris, Messages et Compte / Moi, où vivent la connexion, la langue, le légal et
              la déconnexion. L'en-tête mobile ne garde que la marque et la recherche. */}
        </div>
      </div>

      {enNavigation && <BarreDeChargement libelle={t('loading')} />}
    </nav>
  );
}
