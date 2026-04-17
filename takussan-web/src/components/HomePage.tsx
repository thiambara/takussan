'use client';

import React from 'react';
import { Navbar } from './Navbar';
import { PropertyGrid } from './PropertyGrid';
import { CategoryGrid } from './CategoryGrid';
import { Footer } from './Footer';
import { featuredProperties, latestProperties, categories } from '@/data/mockData';

export interface HomePageProps {
  readonly className?: string;
}

export function HomePage({ className }: HomePageProps) {
  return (
    <div className={`min-h-screen bg-[#f8f9fa] ${className || ''}`}>
      {/* Navbar with integrated search */}
      <Navbar />

      {/* Spacer to push content below the fixed navbar (~65px) */}
      <div className="h-[65px]" />

      {/* Category strip — sticky just below navbar */}
      <CategoryGrid categories={categories} />

      {/* Main Content — immediately visible */}
      <main className="max-w-[1440px] mx-auto px-6 md:px-16 py-10 space-y-20">
        <PropertyGrid
          title="Biens en vedette"
          properties={featuredProperties}
          columns={4}
          showNavigation={true}
          viewAllHref="/biens"
        />

        <PropertyGrid
          title="Derniers ajouts"
          properties={latestProperties}
          columns={5}
          showNavigation={false}
          viewAllHref="/biens"
        />
      </main>

      <Footer />
    </div>
  );
}
