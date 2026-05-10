'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

/**
 * TCK-270 — "Personnalisez votre agence" banner.
 *
 * Surfaced on the agency_admin dashboard right after activation, once the
 * agency exists but no logo has been uploaded yet. Disappears the moment a
 * logo lands (the parent Server Component re-fetches the agency on
 * router.refresh()).
 *
 * Pure presentational: gating (role + missing logo) lives in the parent so
 * SSR pages decide whether to render this at all and we keep the client
 * bundle minimal.
 */
export interface BrandingBannerProps {
  readonly href?: string;
}

export function BrandingBanner({ href = '/admin/agency' }: BrandingBannerProps) {
  const t = useTranslations('agency.branding.banner');

  return (
    <aside
      role="region"
      aria-label={t('title')}
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-nowrap sm:p-5"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-amber-900"
      >
        <Palette className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">{t('title')}</p>
        <p className="mt-0.5 text-sm text-amber-900/80">{t('description')}</p>
      </div>
      <Link
        href={href}
        className={`${buttonVariants({ variant: 'outline' })} shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}
      >
        {t('cta')}
      </Link>
    </aside>
  );
}
