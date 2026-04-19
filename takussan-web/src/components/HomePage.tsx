'use client';

import React from 'react';
import { Navbar } from './home/Navbar';
import { PropertyGrid } from './home/PropertyGrid';
import { Footer } from './home/Footer';
import { useProperties } from '@/hooks/useProperties';

export interface HomePageProps {
  readonly className?: string;
}

export function HomePage({ className }: HomePageProps) {
  const featured = useProperties({ featured: true, perPage: 12 });
  const latest = useProperties({ sort: 'latest', perPage: 12 });

  return (
    <div className={`min-h-screen bg-[#f8f9fa] ${className || ''}`}>
      <Navbar />

      {/* Spacer: navbar row1 (~65px) + category row2 (~68px) */}
      <div className="h-[133px]" />

      <main className="max-w-[1440px] mx-auto px-6 md:px-16 py-10 space-y-20 mb-10">
        <PropertyGrid
          title="Biens en vedette"
          properties={featured.properties}
          loading={featured.loading}
          error={featured.error}
          viewAllHref="/properties"
        />

        <PropertyGrid
          title="Derniers ajouts"
          properties={latest.properties}
          loading={latest.loading}
          error={latest.error}
          viewAllHref="/properties?sort=created_desc"
        />
      </main>

      <Footer />
    </div>
  );
}
