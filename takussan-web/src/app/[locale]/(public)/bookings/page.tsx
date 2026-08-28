import type { Metadata } from 'next';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { getLocale, getTranslations } from 'next-intl/server';
import { Compass, SearchX } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '@/components/bookings/BookingTunnel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings.public');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
  };
}

/**
 * Public booking tunnel entry, accessed via
 * `/bookings?property=<slug>` from the property detail page.
 *
 * The server component fetches the property once for SEO/performance, the
 * client tunnel below handles the interactive flow (TCK-043).
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const params = await searchParams;
  const slug = params.property;
  const t = await getTranslations('bookings.public');

  if (!slug) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <EmptyState
          icon={<Compass className="size-8" aria-hidden="true" />}
          title={t('no_property_title')}
          description={t('no_property_description')}
          action={
            <LienLocalise href="/properties" className={buttonVariants()}>
              {t('browse_cta')}
            </LienLocalise>
          }
        />
      </div>
    );
  }

  let property: PropertyDetail | null = null;
  try {
    const res = await apiFetch<{ data: PropertyDetail }>(
      `/public/properties/${slug}`,
      undefined,
      { locale: await getLocale() },
    );
    property = res.data;
  } catch {
    property = null;
  }

  if (!property) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <EmptyState
          icon={<SearchX className="size-8" aria-hidden="true" />}
          title={t('not_found_title')}
          description={t('not_found_description')}
          action={
            <LienLocalise href="/properties" className={buttonVariants()}>
              {t('browse_cta')}
            </LienLocalise>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-stone-600">{t('subtitle')}</p>
      </header>
      <BookingTunnel property={property} />
    </div>
  );
}
