'use client';

import React, { useState } from 'react';
import { footerLinks } from '@/data/mockData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface FooterProps {
  readonly className?: string;
}

export function Footer({ className }: FooterProps) {
  const [email, setEmail] = useState('');

  return (
    <footer className={`bg-slate-900 text-white ${className || ''}`}>
      <div className="max-w-[1440px] mx-auto px-8 md:px-16 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-12">
          {/* Brand & Newsletter */}
          <div className="lg:col-span-2">
            <h3 className="text-2xl font-bold tracking-tighter mb-4">Takussan</h3>
            <p className="text-slate-400 mb-6 max-w-sm">
              Votre partenaire de confiance pour trouver le bien immobilier idéal au Sénégal.
            </p>

            {/* Newsletter */}
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Votre email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 h-auto px-4 py-3 rounded-lg bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
              <Button className="h-auto px-6 py-3 rounded-lg font-semibold">
                S&apos;inscrire
              </Button>
            </div>
          </div>

          {/* Découvrir */}
          <div>
            <h4 className="font-bold text-lg mb-4">Découvrir</h4>
            <ul className="space-y-3">
              {footerLinks.discover.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-slate-800 pt-8 flex justify-center">
          <p className="text-slate-500 text-sm">
            © 2026 Takussan. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
