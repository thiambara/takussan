'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PropertyCard } from './PropertyCard';
import type { Property } from '@/data/mockData';

export interface PropertyGridProps {
  readonly title: string;
  readonly properties: readonly Property[];
  readonly columns?: 4 | 5;
  readonly showNavigation?: boolean;
  readonly className?: string;
}

export function PropertyGrid({
  title,
  properties,
  columns = 4,
  showNavigation = false,
  className,
}: PropertyGridProps) {
  const gridCols = columns === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';

  return (
    <section className={className}>
      {/* Header */}
      <div className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-gray-900">
            {title}
          </h2>
        </div>
        {showNavigation && (
          <div className="flex gap-3">
            <button className="w-12 h-12 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button className="w-12 h-12 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-8`}
      >
        {properties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </section>
  );
}
