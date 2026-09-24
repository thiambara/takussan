'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, useTransition } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Home, ArrowLeft, Menu, X, ChevronUp, Building2, TreePine, Store, Warehouse, Briefcase, BedDouble, Factory, Hotel, Car, Tractor, PlusCircle, HelpCircle, ParkingCircle, LogOut, UserCircle, Search } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { navLinks, categories, moreCategories } from '@/data/navigation';
import { useAuth } from '@/context/AuthContext';
import { setPublishIntent } from '@/lib/publish-intent';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ChoixDeLangue } from '@/components/shared/ChoixDeLangue';
import { BarreDeChargement } from '@/components/shared/BarreDeChargement';
import { hrefConnexion } from '@/components/auth/lien-connexion';
import { FavoritesPopover } from '@/components/favorites/FavoritesPopover';
import { apiFetch } from '@/lib/api';
import { parametreDe } from '@/types/search';
import { hrefLocalise, localeDuChemin } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { useVerrouDeDefilement } from '@/hooks/useVerrouDeDefilement';
import { useEntreeSentinelle } from '@/hooks/useEntreeSentinelle';
import { cn } from '@/lib/utils';

type PropertyTypeCountsResponse = {
  data: Array<{ value: string; count: number }>;
};

/** `/properties` ou `/fr/properties` — la liste des biens, jamais une fiche (`/properties/<slug>`). */
function estListeDesBiens(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (localeDuChemin(pathname)) segments.shift();
  return segments.length === 1 && segments[0] === 'properties';
}

/**
 * Le lien du menu mobile qui correspond à la page affichée. `navLinks` porte un `active` FIGÉ
 * (« Acheter » à `true`) : le lien s'allumait sur l'accueil, une fiche ou « Louer » même (revue
 * design du 2026-09-16). L'état se lit désormais dans l'URL.
 */
function lienActif(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [chemin, requete] = href.split('?');
  if (chemin === '/properties') {
    const transaction = new URLSearchParams(requete).get('contract_type');
    return estListeDesBiens(pathname) && searchParams.get('contract_type') === transaction;
  }
  return pathname === chemin || pathname.startsWith(`${chemin}/`);
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  apartment: Building2,
  villa: Home,
  terrain: TreePine,
  store: Store,
  house: Warehouse,
  business: Briefcase,
  studio: BedDouble,
  room: BedDouble,
  warehouse: Factory,
  hotel: Hotel,
  resort: Hotel,
  garage: Car,
  parking: ParkingCircle,
  farm: Tractor,
  factory: Factory,
  other: HelpCircle,
};

export interface NavbarProps {
  readonly className?: string;
}

export function Navbar({ className }: NavbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  // TCK-568 (M2) — « Connexion » emporte la page courante et ses filtres en `?redirect=` : se
  // connecter depuis une recherche y ramène, au lieu de toujours mener à `/app`.
  const requete = searchParams.toString();
  const lienConnexion = hrefConnexion(requete ? `${pathname}?${requete}` : pathname);
  const locale = useLocale() as Locale;
  const t = useTranslations('nav');
  const tCategories = useTranslations('property.types');
  const tLinks = useTranslations('nav.links');
  const tCommon = useTranslations('common');
  const TRANSACTION_OPTIONS = [
    { value: 'Acheter', label: t('buy') },
    { value: 'Louer', label: t('rent') },
  ] as const;
  const [menuOpen, setMenuOpen] = useState(false);
  // TCK-551 — fermer le menu rend le focus au bouton menu, y compris par un appui sur le voile.
  // base-ui ne le fait PAS dans ce cas-là quand le navigateur ignore `focus({ preventScroll })`
  // (`FloatingFocusManager`, `onOpenChangeLocal` : Chrome Android, Samsung Internet), pour ne pas
  // faire sauter la page. Le bouton est dans une barre `fixed` : le focaliser ne fait rien défiler.
  const boutonMenuRef = useRef<HTMLButtonElement>(null);
  const fermeParLeVoile = useRef(false);
  const basculerMenu = useCallback((ouvert: boolean, details: { reason: string }) => {
    fermeParLeVoile.current = !ouvert && details.reason === 'outside-press';
    setMenuOpen(ouvert);
  }, []);
  // Le panneau est `lg:hidden`, la MODALE non : menu ouvert à 800 px puis fenêtre passée à 1280
  // (tablette qu'on fait pivoter), `body` restait verrouillé et cinq enfants de `body` en
  // `aria-hidden`, sous une mise en page de bureau (mesuré). Le franchissement de `lg` le ferme.
  useEffect(() => {
    if (!menuOpen) return;
    const bureau = window.matchMedia('(min-width: 64rem)');
    const surChangement = (e: { matches: boolean }) => { if (e.matches) setMenuOpen(false); };
    bureau.addEventListener('change', surChangement);
    return () => bureau.removeEventListener('change', surChangement);
  }, [menuOpen]);
  // Tour 4 — le geste retour ferme le menu : une entrée sentinelle à l'ouverture. ⚠ AVANT le
  // verrou : le navigateur enregistre au `pushState` la position de l'entrée qu'on quitte, et elle
  // doit être la vraie, pas le 0 du verrou (cf. `useEntreeSentinelle`).
  const { remplaceeParUneNavigation } = useEntreeSentinelle(menuOpen, () => setMenuOpen(false));
  // Le verrou de défilement du menu (tour 2) : `body` sorti du flux, et non l'`overflow: hidden`
  // de base-ui, qu'un `scrollBy` et Safari iOS traversent. Cf. `useVerrouDeDefilement`.
  useVerrouDeDefilement(menuOpen);
  /**
   * Un lien du menu : il ferme le menu et navigue en REMPLAÇANT la sentinelle (`replace` sur le
   * lien) — un `back()` ne doit ni défaire la navigation ni la laisser derrière la page d'arrivée.
   * Deux cas où il ne navigue pas, et où la sentinelle se rend donc par `back()` comme à la croix :
   * - la cible est la page courante — le lien ne fait que fermer, comme avant ce ticket (mesuré :
   *   logo sur `/fr`, « Acheter » sur la liste des achats → même URL, même position) ;
   * - un clic modifié (nouvel onglet) : la page ne change pas.
   */
  const quitterParUnLien = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const cible = new URL(e.currentTarget.href, window.location.href);
    const modifie = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
    if (cible.pathname + cible.search === window.location.pathname + window.location.search) {
      e.preventDefault();
    } else if (!modifie) {
      remplaceeParUneNavigation();
    }
    setMenuOpen(false);
  };
  const menuBascule = useCallback((ouvert: boolean) => {
    // Après l'animation de sortie, et seulement si le focus est resté nulle part : la primitive a
    // pu le rendre elle-même, ou le visiteur l'avoir posé ailleurs.
    if (ouvert || !fermeParLeVoile.current) return;
    fermeParLeVoile.current = false;
    const actif = document.activeElement;
    if (!actif || actif === document.body) boutonMenuRef.current?.focus({ preventScroll: true });
  }, []);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
  const [transaction, setTransaction] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [typeCounts, setTypeCounts] = useState<Record<string, number> | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Derive selection from URL — single source of truth, stays in sync with
  // the FilterSidebar on /properties. activeCategory only highlights when
  // exactly one type is selected; multi-select from the sidebar leaves all
  // navbar chips neutral by design.
  const selectedTypes = useMemo(() => {
    const raw = searchParams.get('type');
    return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  }, [searchParams]);
  const categorieDeLUrl = selectedTypes.length === 1 ? selectedTypes[0] : null;

  // Retour d'administration du 2026-09-16 : un clic sur une catégorie ne changeait RIEN à l'écran
  // tant que la page suivante n'était pas servie — la puce ne s'allumait qu'avec la nouvelle URL,
  // et le seul indicateur était en bas de page. La navigation passe donc par une transition : la
  // puce demandée s'allume au clic, et la barre de chargement court sous la navbar tant que la
  // page n'est pas là. `typeDemande` vaut '' pour « retirer le filtre ».
  const [enNavigation, demarrerNavigation] = useTransition();
  const [typeDemande, setTypeDemande] = useState<string | null>(null);
  const activeCategory = enNavigation && typeDemande !== null ? typeDemande || null : categorieDeLUrl;
  const moreHasActive = activeCategory !== null && moreCategories.some((c) => c.type === activeCategory);

  // Fetch real property counts for the "+ More" dropdown.
  useEffect(() => {
    let cancelled = false;
    apiFetch<PropertyTypeCountsResponse>('/public/property-types')
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const entry of res.data) map[entry.value] = entry.count;
        setTypeCounts(map);
      })
      .catch(() => {
        // Silent fallback: dropdown renders without counts.
      });
    return () => { cancelled = true; };
  }, []);

  // Close more dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    // Échap referme ce qui est ouvert — les deux menus de bureau sont faits main, sans primitive
    // qui le porte (revue design du 2026-09-16). Le menu mobile, lui, est un `Sheet` depuis
    // TCK-551 : Échap, l'appui dehors et le retour du focus sont ceux de la primitive.
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setMoreOpen(false);
      setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  async function handleLogout({ remplacer = false }: { readonly remplacer?: boolean } = {}) {
    // TCK-509 — `setUser(null)` seul effaçait l'utilisateur de l'écran mais laissait son JETON au
    // contexte : le compte connecté ensuite lisait l'API avec le jeton révoqué de celui-ci.
    await logout();
    if (remplacer) router.replace(hrefLocalise('/', locale));
    else router.push(hrefLocalise('/', locale));
  }

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : '';

  // TCK-254 — `Publier` is universal: everyone sees the CTA. The
  // `/publish` page resolves where to send the user (login, host wizard,
  // /app/properties/new). Persist intent on click so OAuth round-trips can
  // resume the flow even when `?redirect=/publish` is dropped by the
  // provider.
  const armPublishIntent = useCallback(() => {
    setPublishIntent();
  }, []);

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
    // contract_type from transaction selector (only override if explicitly set)
    if (transaction === 'Acheter') params.set(parametreDe('contract_type'), 'sale');
    if (transaction === 'Louer')   params.set(parametreDe('contract_type'), 'rent');
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
    setTypeDemande(null);
    demarrerNavigation(() => router.push(buildSearchUrl()));
  }, [router, buildSearchUrl]);

  const handleCategoryClick = useCallback((type: string | null) => {
    if (!type) return;
    // Clicking a chip is mono-select: replace ?type= with this single value,
    // or clear it if the chip was already the only active type. This is
    // intentional — the multi-select side lives in the FilterSidebar.
    //
    // Une puce AJOUTE un critère, elle ne réinterprète pas la saisie : tout le reste de l'URL
    // — `q` compris — vient de `buildSearchUrl`, qui est désormais le seul à l'écrire.
    const isOnlyActive = selectedTypes.length === 1 && selectedTypes[0] === type;
    const prochain = isOnlyActive ? '' : type;
    setTypeDemande(prochain);
    demarrerNavigation(() => router.push(buildSearchUrl({ [parametreDe('type')]: prochain })));
  }, [router, buildSearchUrl, selectedTypes]);

  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-background border-b border-border ${className || ''}`}
    >
      {/* TCK-551 (N7) — `px-4` sous `sm`, la gouttière du contenu des pages sur téléphone (logo à
          x = 24 contre 16 pour le `<h1>` de `/properties`, mesuré à 360 et 390) ; `px-6` dès `sm`,
          comme avant. Les pages qui montent la barre sont en `px-4` sous `sm` elles aussi :
          `Navbar.gouttiere.test.tsx` le garde. */}
      <div className="flex items-start gap-4 px-4 sm:px-6 py-3 max-w-[1440px] mx-auto">
        {/* Logo */}
        <LienLocalise href="/" className="text-xl font-bold tracking-tighter text-primary shrink-0 mt-2.5 hover:opacity-80 transition-opacity">
          {tCommon('appName')}
        </LienLocalise>

        {/* Center column: Search bar + Categories stacked, left-aligned — desktop.
            TCK-505 (#2) — la mise en page de bureau attend `lg` : son contenu mesure 869 px, et à
            768 « Publier » sortait du viewport. Entre 768 et 1023 c'est la barre mobile, qui tient. */}
        <div className="hidden lg:flex flex-col max-w-xl w-full mx-auto gap-0">
          {/* Search Bar */}
          <div className="flex items-center bg-card border border-border rounded-full shadow-sm hover:shadow-md transition-shadow">
            <SearchAutocomplete
              variant="hero"
              placeholder={t('searchPlaceholder')}
              className="flex-1 [&>div:first-child]:border-none [&>div:first-child]:shadow-none [&>div:first-child]:rounded-none [&>div:first-child]:bg-transparent"
              value={qEnVigueur}
              onQueryChange={(v) => setLocation(v)}
            />
            <div className="w-px h-6 bg-border shrink-0" />
            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Home className="w-4 h-4 text-primary" />
              <Select value={transaction} onValueChange={(v) => setTransaction(v ?? '')} items={TRANSACTION_OPTIONS}>
                <SelectTrigger className="border-none shadow-none bg-transparent p-0 h-8 text-sm text-foreground font-medium focus-visible:ring-0 focus-visible:border-transparent gap-1">
                  <SelectValue placeholder={t('transactionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acheter">{t('buy')}</SelectItem>
                  <SelectItem value="Louer">{t('rent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="m-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-2.5 transition-[background-color,scale] active:scale-[0.96] shrink-0"
              aria-label={t('searchAria')}
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Category strip */}
          <div className="flex items-center gap-0 -ml-2">
            {categories.map((cat) => {
              const Icon = iconMap[cat.icon] || Building2;
              const isActive = activeCategory === cat.type;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.type)}
                  aria-pressed={isActive}
                  className={`flex flex-col items-center gap-1 px-3 py-2 border-b-2 rounded-t-lg transition-colors duration-150 ${isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span className="text-xs font-semibold whitespace-nowrap">{tCategories(cat.nameKey)}</span>
                </button>
              );
            })}

            {/* More dropdown button */}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className={`flex flex-col items-center gap-1 px-3 py-2 border-b-2 rounded-t-lg transition-colors duration-150 ${moreHasActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                aria-label={t('moreTypes')}
              >
                {moreOpen ? <ChevronUp className="w-[18px] h-[18px]" /> : <PlusCircle className="w-[18px] h-[18px]" />}
                <span className="text-xs font-semibold whitespace-nowrap">{t('more')}</span>
              </button>

              {moreOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-popover rounded-2xl shadow-lg border border-border p-2 z-50 grid grid-cols-2 gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  {moreCategories.map((cat) => {
                    const Icon = iconMap[cat.icon] || HelpCircle;
                    const isActive = activeCategory === cat.type;
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
        </div>

        {/* Actions — desktop, aligned to top */}
        <div className="hidden lg:flex items-center gap-3 shrink-0 ml-auto mt-2">
          <FavoritesPopover />
          <LanguageSwitcher variant="compact" />
          {isLoading ? (
            <div className="size-8 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <>
              <LienLocalise
                href="/publish"
                onClick={armPublishIntent}
                className="inline-flex min-h-10 items-center px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary transition-[background-color,scale] active:scale-[0.96] whitespace-nowrap"
              >
                {t('publish')}
              </LienLocalise>
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label={t('userMenu')}
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-muted transition-colors"
                >
                  <Avatar size="default" className="bg-primary">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground max-w-[120px] truncate">
                    {user.first_name}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-popover rounded-xl shadow-md border border-border py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-border">
                      <p className="text-sm font-semibold text-foreground truncate">{user.first_name} {user.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <LienLocalise
                      href="/app/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <UserCircle className="size-4 text-muted-foreground" />
                      {t('myProfile')}
                    </LienLocalise>
                    <button
                      onClick={() => { void handleLogout(); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <LogOut className="size-4 text-muted-foreground" />
                      {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <LienLocalise
                href={lienConnexion}
                className="inline-flex min-h-10 items-center text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap"
              >
                {t('login')}
              </LienLocalise>
              <LienLocalise
                href="/publish"
                onClick={armPublishIntent}
                className="inline-flex min-h-10 items-center px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary transition-[background-color,scale] active:scale-[0.96] whitespace-nowrap"
              >
                {t('publish')}
              </LienLocalise>
            </>
          )}
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
              <SheetTrigger
                aria-haspopup="dialog"
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
                    placeholder={t('searchPlaceholder')}
                    className="[&_input]:text-base"
                    value={qEnVigueur}
                    onQueryChange={(v) => setLocation(v)}
                    onValider={() => setRechercheOuverte(false)}
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
          <FavoritesPopover variant="compact" />
          {/* TCK-551 (N5) — le menu est une MODALE, sur la primitive de la saisie ci-dessus :
              voile, verrou de défilement, fermeture par un appui dehors / Échap / la croix, focus
              tenu dans le panneau et rendu à ce bouton. Mesuré avant : aucun voile, la page
              défilait dessous (`scrollY` 0 → 500), et un tap « à côté » tombait sur le lien d'une
              carte de résultat — il OUVRAIT une fiche au lieu de fermer le menu.
              Le voile couvre aussi la barre : menu ouvert, la pastille n'est pas atteignable, et
              deux modales ne peuvent pas s'empiler.
              Le menu est un menu de NAVIGATION : la rangée de catégories en est retirée (521 px
              dans 342 visibles, « Commerce » et « Bureau » hors champ) — le tiroir de filtres
              les porte toutes. */}
          {/* `modal="trap-focus"` : la primitive garde le piège du focus, le voile, l'appui dehors,
              Échap et l'`aria-hidden` du reste de la page — mais PAS son verrou de défilement, qui
              sur mobile se réduit à `overflow: hidden` et laissait la page défiler menu ouvert
              (tour 2, mesuré : `scrollBy(0, 500)`, 700 → 1200). Le verrou est
              `useVerrouDeDefilement`, et les deux ne s'empilent pas (cf. son en-tête). */}
          <Sheet modal="trap-focus" open={menuOpen} onOpenChange={basculerMenu} onOpenChangeComplete={menuBascule}>
            <SheetTrigger
              ref={boutonMenuRef}
              aria-label={t('openMenu')}
              className="size-11 shrink-0 grid place-items-center rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent
              side="top"
              // `touch-none` : un glissé qui part du voile n'a rien à faire défiler — pas même le
              // voile, sur un Safari qui ignorerait la sortie du flux de `body`.
              overlayClassName="lg:hidden touch-none"
              // `max-h-5/6` et non `max-h-dvh` : en paysage connecté (740 × 360), le panneau
              // couvrait tout l'écran et aucun voile ne restait à toucher pour le fermer (mesuré).
              className="lg:hidden max-h-5/6 rounded-b-xl bg-popover"
            >
              {/* L'en-tête redessine la barre à l'identique — logo à gauche, croix à la place
                  exacte du bouton menu : le panneau recouvre la barre sans rien déplacer. */}
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 sm:px-6 py-3">
                <LienLocalise
                  href="/"
                  replace
                  onClick={quitterParUnLien}
                  className="mt-2.5 text-xl font-bold tracking-tighter text-primary hover:opacity-80 transition-opacity"
                >
                  {tCommon('appName')}
                </LienLocalise>
                <SheetTitle className="sr-only">{t('menuTitle')}</SheetTitle>
                <SheetClose
                  aria-label={t('closeMenu')}
                  className="size-11 shrink-0 grid place-items-center rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </SheetClose>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {/* Mobile nav links */}
                <div className="flex flex-col px-4 sm:px-6 py-2">
                  {navLinks.map((link) => {
                    const actif = lienActif(link.href, pathname, searchParams);
                    return (
                      <LienLocalise
                        key={link.labelKey}
                        href={link.href}
                        replace
                        onClick={quitterParUnLien}
                        aria-current={actif ? 'page' : undefined}
                        className={`flex min-h-11 items-center font-semibold text-base transition-colors ${actif ? 'text-primary' : 'text-foreground hover:text-primary'
                          }`}
                      >
                        {tLinks(link.labelKey)}
                      </LienLocalise>
                    );
                  })}
                </div>

                {/* TCK-550 — sous `lg`, le seul choix de langue atteignable : celui de bureau est `hidden lg:flex`. */}
                <ChoixDeLangue remplacerLEntree className="px-4 sm:px-6 py-2 border-t border-border justify-between" />

                <div className="px-4 sm:px-6 py-4 border-t border-border flex flex-col gap-3">
                  {user ? (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <Avatar size="default" className="bg-primary">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{user.first_name} {user.last_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                      <LienLocalise
                        href="/app/profile"
                        replace
                        onClick={quitterParUnLien}
                        className="flex min-h-11 items-center gap-2.5 text-sm text-foreground"
                      >
                        <UserCircle className="size-4 text-muted-foreground" />
                        {t('myProfile')}
                      </LienLocalise>
                      <LienLocalise
                        href="/publish"
                        replace
                        onClick={(e) => { armPublishIntent(); quitterParUnLien(e); }}
                        className={buttonVariants({ className: 'rounded-full px-6 h-auto py-3 font-semibold text-sm shadow-sm' })}
                      >
                        {t('publishListing')}
                      </LienLocalise>
                      <button
                        onClick={() => {
                          // Comme un lien : la redirection vers l'accueil remplace la sentinelle,
                          // sauf si on y est déjà (la sentinelle se rend alors par `back()`).
                          const remplacer = pathname !== hrefLocalise('/', locale);
                          if (remplacer) remplaceeParUneNavigation();
                          setMenuOpen(false);
                          void handleLogout({ remplacer });
                        }}
                        className="flex min-h-11 items-center gap-2.5 text-sm text-foreground"
                      >
                        <LogOut className="size-4 text-muted-foreground" />
                        {t('logout')}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* TCK-551 (N7) — `cn()` et non `buttonVariants({ className })` : `cva` CONCATÈNE,
                          il ne fusionne pas. `px-2.5` de la variante et `px-0` d'ici étaient présents
                          tous les deux, et `px-2.5` gagnait (texte à x = 35 contre 24, mesuré). */}
                      <LienLocalise href={lienConnexion} replace onClick={quitterParUnLien} className={cn(buttonVariants({ variant: 'ghost' }), 'text-foreground font-medium text-sm h-11 justify-start px-0 hover:bg-transparent hover:text-primary')}>
                        {t('login')}
                      </LienLocalise>
                      <LienLocalise
                        href="/publish"
                        replace
                        onClick={(e) => { armPublishIntent(); quitterParUnLien(e); }}
                        className={buttonVariants({ className: 'rounded-full px-6 h-auto py-3 font-semibold text-sm shadow-sm' })}
                      >
                        {t('publishListing')}
                      </LienLocalise>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {enNavigation && <BarreDeChargement libelle={t('loading')} />}
    </nav>
  );
}
