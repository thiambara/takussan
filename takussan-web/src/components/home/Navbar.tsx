'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Home, Menu, X, ChevronDown, ChevronUp, Building2, TreePine, Store, Warehouse, Briefcase, BedDouble, Factory, Hotel, Car, Tractor, PlusCircle, HelpCircle, ParkingCircle } from 'lucide-react';
import { navLinks, categories, moreCategories } from '@/data/mockData';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [transaction, setTransaction] = useState('Acheter');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close more dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-white border-b border-gray-200 ${className || ''}`}
    >
      <div className="flex items-start gap-4 px-6 py-3 max-w-[1440px] mx-auto">
        {/* Logo — aligned to top of the search bar */}
        <div className="text-xl font-bold tracking-tighter text-[#0050cb] shrink-0 mt-2.5">
          Takussan
        </div>

        {/* Center column: Search bar + Categories stacked, left-aligned — desktop */}
        <div className="hidden md:flex flex-col max-w-xl w-full mx-auto gap-0">
          {/* Search Bar */}
          <div className="flex items-center bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="flex items-center gap-2 flex-1 px-4 py-2.5">
              <MapPin className="w-4 h-4 text-[#0050cb] shrink-0" />
              <input
                type="text"
                placeholder="Où cherchez-vous ?"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full text-sm text-gray-900 placeholder:text-gray-400 font-medium outline-none bg-transparent"
              />
            </div>
            <div className="w-px h-6 bg-gray-200 shrink-0" />
            <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0">
              <Home className="w-4 h-4 text-[#0050cb]" />
              <select
                value={transaction}
                onChange={(e) => setTransaction(e.target.value)}
                className="text-sm text-gray-900 font-medium outline-none bg-transparent appearance-none cursor-pointer pr-1"
              >
                <option>Acheter</option>
                <option>Louer</option>
                <option>Neuf</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <button className="m-1.5 bg-[#0050cb] hover:bg-[#0043a8] text-white rounded-full p-2.5 transition-colors active:scale-95 shrink-0">
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
                  onClick={() => setActiveCategory(isActive ? null : cat.type)}
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
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${isActive
                          ? 'bg-[#0050cb]/10 text-[#0050cb] font-semibold'
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
          <button className="font-medium text-sm text-slate-600 hover:text-[#0050cb] transition-colors whitespace-nowrap">
            Connexion
          </button>
          <button className="bg-[#0050cb] text-white px-5 py-2 rounded-full font-semibold text-sm hover:opacity-90 active:scale-95 duration-200 shadow-sm whitespace-nowrap">
            Publier
          </button>
        </div>

        {/* Mobile: search pill + hamburger */}
        <div className="flex md:hidden flex-1 items-center gap-3">
          <button className="flex-1 flex items-center gap-2 bg-white border border-gray-300 rounded-full px-4 py-2.5 shadow-sm text-left">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-400 truncate">Où cherchez-vous ?</span>
          </button>
          <button
            className="p-2 rounded-lg text-slate-600 hover:text-[#0050cb] hover:bg-gray-100 transition-colors"
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
          {/* Mobile Search */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-4 py-3 mb-2">
              <MapPin className="w-4 h-4 text-[#0050cb] shrink-0" />
              <input
                type="text"
                placeholder="Où cherchez-vous ?"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 font-medium outline-none bg-transparent"
              />
            </div>
            <div className="flex gap-2">
              {['Acheter', 'Louer', 'Neuf'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTransaction(t)}
                  className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${transaction === t
                    ? 'bg-[#0050cb] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
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
                    onClick={() => setActiveCategory(isActive ? null : cat.type)}
                    className={`flex flex-col items-center gap-1 shrink-0 px-4 py-2.5 rounded-xl transition-colors ${isActive
                      ? 'bg-[#0050cb]/10 text-[#0050cb]'
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
                className={`font-semibold text-base transition-colors ${link.active ? 'text-[#0050cb]' : 'text-slate-700 hover:text-[#0050cb]'
                  }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-3">
            <button className="font-medium text-sm text-slate-600 hover:text-[#0050cb] transition-colors text-left">
              Connexion
            </button>
            <button className="bg-[#0050cb] text-white px-6 py-3 rounded-full font-semibold text-sm hover:opacity-90 active:scale-95 duration-200 shadow-sm">
              Publier une annonce
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
