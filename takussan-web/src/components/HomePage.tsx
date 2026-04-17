'use client';

import React from 'react';
import { Navbar } from './Navbar';
import { PropertyGrid } from './PropertyGrid';
import { Footer } from './Footer';
import { featuredProperties, latestProperties } from '@/data/mockData';

export interface HomePageProps {
  readonly className?: string;
}

export function HomePage({ className }: HomePageProps) {
  return (
    <div className={`min-h-screen bg-[#f8f9fa] ${className || ''}`}>
      <Navbar />

      {/* Spacer: navbar row1 (~65px) + category row2 (~68px) */}
      <div className="h-[133px]" />

      <main className="max-w-[1440px] mx-auto px-6 md:px-16 py-10 space-y-20">
        <PropertyGrid
          title="Biens en vedette"
          properties={featuredProperties}
          viewAllHref="/biens"
        />

        <PropertyGrid
          title="Derniers ajouts"
          properties={latestProperties}
          viewAllHref="/biens"
        />
      </main>

      <Footer />
    </div>
  );
}
