'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Home, Menu, X, ChevronUp, Building2, TreePine, Store, Warehouse, Briefcase, BedDouble, Factory, Hotel, Car, Tractor, PlusCircle, HelpCircle, ParkingCircle, LogOut, UserCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { navLinks, categories, moreCategories } from '@/data/mockData';
import { useAuth } from '@/context/AuthContext';

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
  const { user, isLoading, setUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [transaction, setTransaction] = useState('Acheter');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
    router.push('/');
  }

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : '';

  // ─── Navigation helpers ─────────────────────────────────────────────────────

  const buildSearchUrl = useCallback((overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    // contract_type from transaction selector
    if (transaction === 'Acheter') params.set('contract_type', 'sale');
    if (transaction === 'Louer')   params.set('contract_type', 'rent');
    // location text → city filter
    if (location.trim()) params.set('city', location.trim());
    // active category → type filter
    if (activeCategory) params.set('type', activeCategory);
    // apply overrides (e.g. from a category click)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === '') params.delete(k); else params.set(k, v);
    });
    const qs = params.toString();
    return `/properties${qs ? '?' + qs : ''}`;
  }, [transaction, location, activeCategory]);

  const handleSearch = useCallback(() => {
    router.push(buildSearchUrl());
  }, [router, buildSearchUrl]);

  const handleCategoryClick = useCallback((type: string | null, currentActive: string | null) => {
    // toggle off if same, else navigate with new type
    const newType = currentActive === type ? null : type;
    setActiveCategory(newType);
    const params = new URLSearchParams();
    if (transaction === 'Acheter') params.set('contract_type', 'sale');
    if (transaction === 'Louer')   params.set('contract_type', 'rent');
    if (location.trim()) params.set('city', location.trim());
    if (newType) params.set('type', newType);
    router.push(`/properties${params.size ? '?' + params.toString() : ''}`);
  }, [router, transaction, location]);

  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-white border-b border-gray-200 ${className || ''}`}
    >
      <div className="flex items-start gap-4 px-6 py-3 max-w-[1440px] mx-auto">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold tracking-tighter text-primary shrink-0 mt-2.5 hover:opacity-80 transition-opacity">
          Takussan
        </Link>

        {/* Center column: Search bar + Categories stacked, left-aligned — desktop */}
        <div className="hidden md:flex flex-col max-w-xl w-full mx-auto gap-0">
          {/* Search Bar */}
          <div className="flex items-center bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="flex items-center gap-2 flex-1 px-4 py-2.5">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <input
                type="text"
                placeholder="Où cherchez-vous ?"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 font-medium outline-none bg-transparent"
              />
            </div>
            <div className="w-px h-6 bg-gray-200 shrink-0" />
            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Home className="w-4 h-4 text-primary" />
              <Select value={transaction} onValueChange={(v) => setTransaction(v ?? 'Acheter')}>
                <SelectTrigger className="border-none shadow-none bg-transparent p-0 h-auto text-sm text-gray-900 font-medium focus-visible:ring-0 focus-visible:border-transparent gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acheter">Acheter</SelectItem>
                  <SelectItem value="Louer">Louer</SelectItem>
                  <SelectItem value="Neuf">Neuf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleSearch}
              className="m-1.5 bg-primary hover:bg-primary/90 text-white rounded-full p-2.5 transition-colors active:scale-95 shrink-0"
              aria-label="Lancer la recherche"
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
                  onClick={() => handleCategoryClick(cat.type, activeCategory)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 border-b-2 transition-all duration-150 ${isActive
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-400 hover:text-gray-700'
                    }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span className="text-[11px] font-semibold whitespace-nowrap">{cat.name}</span>
                </button>
              );
            })}

            {/* More dropdown button */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                className={`flex flex-col items-center gap-1 px-3 py-2 border-b-2 transition-all duration-150 ${moreCategories.some((c) => c.type === activeCategory)
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-400 hover:text-gray-700'
                  }`}
                aria-label="Plus de types"
              >
                {moreOpen ? <ChevronUp className="w-[18px] h-[18px]" /> : <PlusCircle className="w-[18px] h-[18px]" />}
                <span className="text-[11px] font-semibold whitespace-nowrap">Plus</span>
              </button>

              {moreOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 z-50 grid grid-cols-2 gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  {moreCategories.map((cat) => {
                    const Icon = iconMap[cat.icon] || HelpCircle;
                    const isActive = activeCategory === cat.type;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setActiveCategory(isActive ? null : cat.type);
                          setMoreOpen(false);
                          handleCategoryClick(cat.type, activeCategory);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold leading-none truncate">{cat.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{cat.count} biens</p>
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
          {isLoading ? (
            <div className="size-8 rounded-full bg-gray-100 animate-pulse" />
          ) : user ? (
            <>
              <Link href="/dashboard/annonces/new" className={buttonVariants({ className: 'rounded-full px-5 py-2 h-auto font-semibold text-sm shadow-sm whitespace-nowrap' })}>
                Publier
              </Link>
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label="Menu utilisateur"
                  className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-100 transition-colors"
                >
                  <Avatar size="default" className="bg-primary">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-slate-700 max-w-[120px] truncate">
                    {user.first_name}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-md border border-gray-100 py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <p className="text-sm font-semibold text-slate-800 truncate">{user.first_name} {user.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/dashboard/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-colors"
                    >
                      <UserCircle className="size-4 text-slate-400" />
                      Mon profil
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-colors"
                    >
                      <LogOut className="size-4 text-slate-400" />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/auth/login" className={buttonVariants({ variant: 'ghost', className: 'text-slate-600 font-medium text-sm whitespace-nowrap h-auto py-2' })}>
                Connexion
              </Link>
              <Link href="/auth/login?redirect=/dashboard" className={buttonVariants({ className: 'rounded-full px-5 py-2 h-auto font-semibold text-sm shadow-sm whitespace-nowrap' })}>
                Publier
              </Link>
            </>
          )}
        </div>

          {/* Mobile: search pill → opens search page */}
          <div className="flex md:hidden flex-1 items-center gap-3">
            <button
              onClick={handleSearch}
              className="flex-1 flex items-center gap-2 bg-white border border-gray-300 rounded-full px-4 py-2.5 shadow-sm text-left"
            >
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-400 truncate">Où cherchez-vous ?</span>
            </button>
          <button
            className="p-2 rounded-lg text-slate-600 hover:text-primary hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white border-t border-gray-100 shadow-lg">
            {/* Mobile search */}
            <div className="px-6 pt-5 pb-3">
              <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-4 py-3 mb-2">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <input
                  type="text"
                  placeholder="Où cherchez-vous ?"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setMenuOpen(false); handleSearch(); } }}
                  className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 font-medium outline-none bg-transparent"
                />
              </div>
              <div className="flex gap-2">
                {['Acheter', 'Louer', 'Neuf'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTransaction(t)}
                    className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${transaction === t
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Button
                onClick={() => { setMenuOpen(false); handleSearch(); }}
                className="mt-3 w-full rounded-full h-auto py-2.5 text-sm font-semibold"
              >
                Rechercher
              </Button>
            </div>

            {/* Mobile categories */}
            <div className="px-6 pb-3 border-t border-gray-100 pt-3">
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((cat) => {
                  const Icon = iconMap[cat.icon] || Building2;
                  const isActive = activeCategory === cat.type;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setMenuOpen(false);
                        handleCategoryClick(cat.type, activeCategory);
                      }}
                      className={`flex flex-col items-center gap-1 shrink-0 px-4 py-2.5 rounded-xl transition-colors ${isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-semibold whitespace-nowrap">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          {/* Mobile nav links */}
          <div className="flex flex-col px-6 py-3 gap-4 border-t border-gray-100">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`font-semibold text-base transition-colors ${link.active ? 'text-primary' : 'text-slate-700 hover:text-primary'
                  }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <Avatar size="default" className="bg-primary">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{user.first_name} {user.last_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 text-sm text-slate-700 py-1"
                >
                  <UserCircle className="size-4 text-slate-400" />
                  Mon profil
                </Link>
                <Link
                  href="/dashboard/annonces/new"
                  onClick={() => setMenuOpen(false)}
                  className={buttonVariants({ className: 'rounded-full px-6 h-auto py-3 font-semibold text-sm shadow-sm' })}
                >
                  Publier une annonce
                </Link>
                <button
                  onClick={() => { setMenuOpen(false); void handleLogout(); }}
                  className="flex items-center gap-2.5 text-sm text-slate-700 py-1"
                >
                  <LogOut className="size-4 text-slate-400" />
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" onClick={() => setMenuOpen(false)} className={buttonVariants({ variant: 'ghost', className: 'text-slate-600 font-medium text-sm h-auto py-1 justify-start' })}>
                  Connexion
                </Link>
                <Link href="/auth/login?redirect=/dashboard" onClick={() => setMenuOpen(false)} className={buttonVariants({ className: 'rounded-full px-6 h-auto py-3 font-semibold text-sm shadow-sm' })}>
                  Publier une annonce
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
