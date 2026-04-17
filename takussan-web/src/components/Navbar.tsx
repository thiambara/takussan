'use client';

import React from 'react';
import { navLinks } from '@/data/mockData';

export interface NavbarProps {
  readonly className?: string;
}

export function Navbar({ className }: NavbarProps) {
  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl shadow-[0_4px_6px_-1px_rgba(0,80,203,0.04)] ${className || ''}`}
    >
      <div className="flex justify-between items-center px-8 py-4 max-w-[1440px] mx-auto">
        {/* Logo */}
        <div className="text-2xl font-bold tracking-tighter text-[#0050cb]">
          Takussan
        </div>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`font-semibold tracking-tight text-sm transition-colors ${
                link.active
                  ? 'text-[#0050cb] border-b-2 border-[#0050cb]'
                  : 'text-slate-600 hover:text-[#0050cb]'
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button className="font-medium text-sm text-slate-600 hover:text-[#0050cb] transition-colors">
            Connexion
          </button>
          <button className="bg-[#0066ff] text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:opacity-90 active:scale-95 duration-200 shadow-sm">
            Publier une annonce
          </button>
        </div>
      </div>
    </nav>
  );
}
