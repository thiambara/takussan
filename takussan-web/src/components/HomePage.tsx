'use client';

import React from 'react';
import { Navbar } from './Navbar';
import { Hero } from './Hero';
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
      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <Hero />

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-8 md:px-16 py-24 space-y-32">
        {/* Featured Properties - 2x4 Grid */}
        <PropertyGrid
          title="Biens en vedette"
          properties={featuredProperties}
          columns={4}
          showNavigation={true}
        />

        {/* Categories */}
        <CategoryGrid categories={categories} />

        {/* Latest Properties - 2x5 Grid */}
        <PropertyGrid
          title="Derniers ajouts"
          properties={latestProperties}
          columns={5}
          showNavigation={false}
        />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
