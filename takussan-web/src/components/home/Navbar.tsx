'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home, MapPin, Menu, X, ChevronUp, Building2, TreePine, Store, Warehouse, Briefcase, BedDouble, Factory, Hotel, Car, Tractor, PlusCircle, HelpCircle, ParkingCircle, LogOut, UserCircle, Search } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { navLinks, categories, moreCategories } from '@/data/navigation';
import { useAuth } from '@/context/AuthContext';
import { setPublishIntent } from '@/lib/publish-intent';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { FavoritesPopover } from '@/components/favorites/FavoritesPopover';
import { apiFetch } from '@/lib/api';
import { parametreDe } from '@/types/search';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';

type PropertyTypeCountsResponse = {
  data: Array<{ value: string; count: number }>;
};

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
  const { user, isLoading, setUser } = useAuth();
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [location, setLocation] = useState('');
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
  const activeCategory = selectedTypes.length === 1 ? selectedTypes[0] : null;
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push(hrefLocalise('/', locale));
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
    if (location.trim()) params.set(parametreDe('q'), location.trim());
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
    router.push(buildSearchUrl());
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
    router.push(buildSearchUrl({ [parametreDe('type')]: isOnlyActive ? '' : type }));
  }, [router, buildSearchUrl, selectedTypes]);

  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-background border-b border-border ${className || ''}`}
    >
      <div className="flex items-start gap-4 px-6 py-3 max-w-[1440px] mx-auto">
        {/* Logo */}
        <LienLocalise href="/" className="text-xl font-bold tracking-tighter text-primary shrink-0 mt-2.5 hover:opacity-80 transition-opacity">
          {tCommon('appName')}
        </LienLocalise>

        {/* Center column: Search bar + Categories stacked, left-aligned — desktop */}
        <div className="hidden md:flex flex-col max-w-xl w-full mx-auto gap-0">
          {/* Search Bar */}
          <div className="flex items-center bg-card border border-border rounded-full shadow-sm hover:shadow-md transition-shadow">
            <SearchAutocomplete
              variant="hero"
              placeholder={t('searchPlaceholder')}
              className="flex-1 [&>div:first-child]:border-none [&>div:first-child]:shadow-none [&>div:first-child]:rounded-none [&>div:first-child]:bg-transparent"
              onQueryChange={(v) => setLocation(v)}
            />
            <div className="w-px h-6 bg-border shrink-0" />
            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Home className="w-4 h-4 text-primary" />
              <Select value={transaction} onValueChange={(v) => setTransaction(v ?? '')} items={TRANSACTION_OPTIONS}>
                <SelectTrigger className="border-none shadow-none bg-transparent p-0 h-auto text-sm text-foreground font-medium focus-visible:ring-0 focus-visible:border-transparent gap-1">
                  <SelectValue placeholder={t('transactionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acheter">{t('buy')}</SelectItem>
                  <SelectItem value="Louer">{t('rent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleSearch}
              className="m-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-2.5 transition-colors active:scale-95 shrink-0"
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
                  className={`flex flex-col items-center gap-1 px-3 py-2 border-b-2 transition-all duration-150 ${isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                    }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span className="text-[11px] font-semibold whitespace-nowrap">{tCategories(cat.nameKey)}</span>
                </button>
              );
            })}

            {/* More dropdown button */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                className={`flex flex-col items-center gap-1 px-3 py-2 border-b-2 transition-all duration-150 ${moreHasActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                  }`}
                aria-label={t('moreTypes')}
              >
                {moreOpen ? <ChevronUp className="w-[18px] h-[18px]" /> : <PlusCircle className="w-[18px] h-[18px]" />}
                <span className="text-[11px] font-semibold whitespace-nowrap">{t('more')}</span>
              </button>

              {moreOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-popover rounded-2xl shadow-xl border border-border p-3 z-50 grid grid-cols-2 gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
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
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold leading-none truncate">{tCategories(cat.nameKey)}</p>
                          {count !== undefined && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{t('propertiesCount', { count })}</p>
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
        <div className="hidden md:flex items-center gap-3 shrink-0 ml-auto mt-2">
          <FavoritesPopover />
          <LanguageSwitcher variant="compact" />
          {isLoading ? (
            <div className="size-8 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <>
              <LienLocalise
                href="/publish"
                onClick={armPublishIntent}
                className="inline-flex items-center px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary transition-colors whitespace-nowrap"
              >
                {t('publish')}
              </LienLocalise>
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label={t('userMenu')}
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
                      onClick={handleLogout}
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
                href="/auth/login"
                className="inline-flex items-center text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap"
              >
                {t('login')}
              </LienLocalise>
              <LienLocalise
                href="/publish"
                onClick={armPublishIntent}
                className="inline-flex items-center px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary transition-colors whitespace-nowrap"
              >
                {t('publish')}
              </LienLocalise>
            </>
          )}
        </div>

          {/* Mobile: search pill → opens search page */}
          <div className="flex md:hidden flex-1 items-center gap-2">
            <button
              onClick={handleSearch}
              className="flex-1 flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2.5 shadow-sm text-left"
            >
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{t('searchPlaceholder')}</span>
            </button>
          <FavoritesPopover variant="compact" />
          <button
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-popover border-t border-border shadow-lg">
            {/* Mobile search */}
            <div className="px-6 pt-5 pb-3">
              <div className="flex items-center gap-2 border border-border rounded-xl px-4 py-3 mb-2">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setMenuOpen(false); handleSearch(); } }}
                  className="flex-1 text-sm text-foreground placeholder:text-muted-foreground font-medium outline-none bg-transparent"
                />
              </div>
              <div className="flex gap-2">
                {[
                  { value: 'Acheter', label: t('buy') },
                  { value: 'Louer', label: t('rent') },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTransaction(opt.value)}
                    className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${transaction === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-secondary'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button
                onClick={() => { setMenuOpen(false); handleSearch(); }}
                className="mt-3 w-full rounded-full h-auto py-2.5 text-sm font-semibold"
              >
                {t('search')}
              </Button>
            </div>

            {/* Mobile categories */}
            <div className="px-6 pb-3 border-t border-border pt-3">
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((cat) => {
                  const Icon = iconMap[cat.icon] || Building2;
                  const isActive = activeCategory === cat.type;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setMenuOpen(false);
                        handleCategoryClick(cat.type);
                      }}
                      className={`flex flex-col items-center gap-1 shrink-0 px-4 py-2.5 rounded-xl transition-colors ${isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-semibold whitespace-nowrap">{tCategories(cat.nameKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          {/* Mobile nav links */}
          <div className="flex flex-col px-6 py-3 gap-4 border-t border-border">
            {navLinks.map((link) => (
              <LienLocalise
                key={link.labelKey}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`font-semibold text-base transition-colors ${link.active ? 'text-primary' : 'text-foreground hover:text-primary'
                  }`}
              >
                {tLinks(link.labelKey)}
              </LienLocalise>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-border flex flex-col gap-3">
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
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 text-sm text-foreground py-1"
                >
                  <UserCircle className="size-4 text-muted-foreground" />
                  {t('myProfile')}
                </LienLocalise>
                <LienLocalise
                  href="/publish"
                  onClick={() => { armPublishIntent(); setMenuOpen(false); }}
                  className={buttonVariants({ className: 'rounded-full px-6 h-auto py-3 font-semibold text-sm shadow-sm' })}
                >
                  {t('publishListing')}
                </LienLocalise>
                <button
                  onClick={() => { setMenuOpen(false); void handleLogout(); }}
                  className="flex items-center gap-2.5 text-sm text-foreground py-1"
                >
                  <LogOut className="size-4 text-muted-foreground" />
                  {t('logout')}
                </button>
              </>
            ) : (
              <>
                <LienLocalise href="/auth/login" onClick={() => setMenuOpen(false)} className={buttonVariants({ variant: 'ghost', className: 'text-muted-foreground font-medium text-sm h-auto py-1 justify-start' })}>
                  {t('login')}
                </LienLocalise>
                <LienLocalise
                  href="/publish"
                  onClick={() => { armPublishIntent(); setMenuOpen(false); }}
                  className={buttonVariants({ className: 'rounded-full px-6 h-auto py-3 font-semibold text-sm shadow-sm' })}
                >
                  {t('publishListing')}
                </LienLocalise>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
