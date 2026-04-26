'use client';

import React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { PropertyCard } from '@/components/property/PropertyCard';
import { RecentlyViewedCarousel } from '@/components/property/RecentlyViewedCarousel';
import { Skeleton } from '@/components/ui/skeleton';
import { useProperties } from '@/hooks/useProperties';
import type { PropertyListItem } from '@/types/property';

/**
 * Homepage hero + two discovery sections (featured, latest).
 * Wave 3 — TCK-038.
 *
 * Reuses the existing `Navbar` / `Footer` / `useProperties` infra from
 * Wave 2 but renders the canonical {@link PropertyCard} from
 * `components/property/`, which is the long-term owner of the card
 * surface (supports the real favorites button).
 *
 * Search redirection is handled by the Navbar (which already wires
 * input → `/properties?...`), so the hero on this page keeps an
 * inspirational visual and delegates the form flow to the nav.
 */

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-4/3 w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

interface DiscoverySectionProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  properties: readonly PropertyListItem[];
  loading: boolean;
  error: string | null;
}

function DiscoverySection({
  title,
  subtitle,
  viewAllHref,
  properties,
  loading,
  error,
}: DiscoverySectionProps) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-primary hover:underline underline-offset-4 transition-colors"
          >
            Voir plus →
          </Link>
        )}
      </div>

      {error ? (
        <div className="py-12 text-center text-stone-400 text-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-15">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => <CardSkeleton key={i} />)
            : properties.map((property, i) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  index={i}
                  priority={i < 2}
                />
              ))}
        </div>
      )}
    </section>
  );
}

export function HomepageDiscovery() {
  const featured = useProperties({ featured: true, perPage: 12 });
  const latest = useProperties({ sort: 'latest', perPage: 12 });

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <Navbar />

      {/* Navbar row 1 (~65px) + category row 2 (~68px) spacer. */}
      <div className="h-[133px]" />

      <main className="max-w-[1440px] mx-auto px-6 md:px-16 py-10 space-y-20 mb-10">
        <DiscoverySection
          title="Biens en vedette"
          subtitle="Une sélection mise en avant par nos équipes."
          viewAllHref="/properties?featured=true"
          properties={featured.properties}
          loading={featured.loading}
          error={featured.error}
        />

        <DiscoverySection
          title="Derniers ajouts"
          subtitle="Les biens publiés le plus récemment."
          viewAllHref="/properties?sort=created_desc"
          properties={latest.properties}
          loading={latest.loading}
          error={latest.error}
        />

        <RecentlyViewedCarousel />
      </main>

      <Footer />
    </div>
  );
}
