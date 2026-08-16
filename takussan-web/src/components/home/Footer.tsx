'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { footerLinks } from '@/data/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface FooterProps {
  readonly className?: string;
}

export function Footer({ className }: FooterProps) {
  const [email, setEmail] = useState('');
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className={`bg-slate-900 text-white ${className || ''}`}>
      <div className="max-w-[1440px] mx-auto px-8 md:px-16 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-12">
          <div className="lg:col-span-2">
            <h3 className="text-2xl font-bold tracking-tighter mb-4">Takussan</h3>
            <p className="text-slate-400 mb-6 max-w-sm">{t('tagline')}</p>

            <div className="flex gap-2">
              <Input
                type="email"
                placeholder={t('newsletterPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 h-auto px-4 py-3 rounded-lg bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
              <Button className="h-auto px-6 py-3 rounded-lg font-semibold">
                {t('newsletterSubmit')}
              </Button>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-4">{t('discoverHeading')}</h4>
            <ul className="space-y-3">
              {footerLinks.discover.map((link) => (
                <li key={link.labelKey}>
                  <a
                    href={link.href}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {t(`discover.${link.labelKey}`)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex justify-center">
          <p className="text-slate-500 text-sm">{t('copyright', { year })}</p>
        </div>
      </div>
    </footer>
  );
}
