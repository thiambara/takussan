'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { PropertyRow } from '@/components/property/cards/PropertyRow';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { RecentlyViewedCarousel } from '@/components/property/RecentlyViewedCarousel';
import { useProperties } from '@/hooks/useProperties';
import { useUserLocation } from '@/components/providers/UserLocationProvider';
import { dedupeAcross } from '@/lib/dedupeBy';

/**
 * Homepage publique — TCK-129.
 * Quatre rangées scrollables, une variante de carte par section :
 *  - Standard 4:3   → « Près de toi · À découvrir à Dakar »
 *  - Listing wide   → « À louer · Pour ton prochain logement »
 *  - Cover 3:4      → « Coup de cœur · Sélection de la semaine » (signature)
 *  - Compact 1:1    → « Nouveau · Tout juste publié »
 *
 * Pas de hero marketing — l'intention de l'utilisateur est pré-formée. La
 * navbar porte search + catégories ; cette page démarre directement par la
 * découverte.
 */
export function HomepageDiscovery() {
  const t = useTranslations('homepage.row');
  const { city: nearCity } = useUserLocation();

  // Slight over-fetch so the dedup pass can drop crossover IDs without
  // leaving a section visibly thin (each row still aims for ~6–8 visible).
  const near = useProperties({ city: nearCity, perPage: 10 });
  const rent = useProperties({ transaction: 'rent', perPage: 12 });
  const featured = useProperties({ featured: true, perPage: 12 });
  const latest = useProperties({ sort: 'latest', perPage: 14 });

  const viewAll = t('viewAll');

  // Featured est une rangée curée : ses items réapparaissent intentionnellement
  // dans les autres rangées (un coup de cœur en location à Dakar *est* aussi
  // un bien Dakar et un bien à louer). On dédupe donc uniquement entre les
  // trois rangées de découverte par filtre, où voir le même bien deux fois
  // côte à côte serait gênant.
  const [nearUnique, rentUnique, latestUnique] = useMemo(
    () =>
      dedupeAcross(
        [near.properties, rent.properties, latest.properties],
        (p) => p.id,
      ),
    [near.properties, rent.properties, latest.properties],
  );
  const featuredUnique = featured.properties;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Spacer : 1ère ligne navbar (~65px) + ligne catégories (~68px). */}
      <div className="h-[133px]" />

      <main className="max-w-[1440px] mx-auto px-6 md:px-12 pt-12 pb-24 space-y-20">
        <div
          className="animate-section-enter"
          style={{ animationDelay: '40ms' }}
        >
          <PropertyRow
            variant="standard"
            eyebrow={t('near.eyebrow')}
            title={t('near.title', { city: nearCity })}
            viewAllHref={`/properties?city=${encodeURIComponent(nearCity)}`}
            viewAllLabel={viewAll}
            properties={nearUnique}
            loading={near.loading}
            error={near.error}
            priorityCount={2}
          />
        </div>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '120ms' }}
        >
          <PropertyRow
            variant="listing"
            eyebrow={t('rent.eyebrow')}
            title={t('rent.title')}
            viewAllHref="/properties?contract_type=rent"
            viewAllLabel={viewAll}
            properties={rentUnique}
            loading={rent.loading}
            error={rent.error}
          />
        </div>

        {/* Rangée signature — fond cream + pattern bogolan stylisé (≤5%). */}
        <section
          className="animate-section-enter relative"
          style={{ animationDelay: '200ms' }}
        >
          <div className="absolute inset-x-[-12px] inset-y-[-32px] md:inset-x-[-24px] md:inset-y-[-48px] -z-10 rounded-[28px] overflow-hidden bg-card">
            <div className="absolute inset-0 opacity-[0.045] text-foreground">
              <BogolanPattern className="w-full h-full" color="currentColor" />
            </div>
          </div>

          <PropertyRow
            variant="cover"
            eyebrow={t('featured.eyebrow')}
            title={t('featured.title')}
            viewAllHref="/properties?featured=true"
            viewAllLabel={viewAll}
            properties={featuredUnique}
            loading={featured.loading}
            error={featured.error}
          />
        </section>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '280ms' }}
        >
          <PropertyRow
            variant="compact"
            eyebrow={t('latest.eyebrow')}
            title={t('latest.title')}
            viewAllHref="/properties?sort=created_desc"
            viewAllLabel={viewAll}
            properties={latestUnique}
            loading={latest.loading}
            error={latest.error}
          />
        </div>

        <div
          className="animate-section-enter"
          style={{ animationDelay: '360ms' }}
        >
          <RecentlyViewedCarousel />
        </div>
      </main>

      <Footer />
    </div>
  );
}
