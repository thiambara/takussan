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
  readonly viewAllHref?: string;
  readonly className?: string;
}

export function PropertyGrid({
  title,
  properties,
  columns = 4,
  showNavigation = false,
  viewAllHref,
  className,
}: PropertyGridProps) {
  const gridCols = columns === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';

  return (
    <section className={className}>
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{properties.length} biens</p>
        </div>
        <div className="flex items-center gap-4">
          {viewAllHref && (
            <a
              href={viewAllHref}
              className="text-sm font-semibold text-[#0050cb] hover:underline underline-offset-4 transition-colors"
            >
              Voir tout →
            </a>
          )}
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
      </div>

      {/* Grid */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridCols} gap-8`}>
        {properties.map((property, i) => (
          <PropertyCard key={property.id} property={property} index={i} />
        ))}
      </div>
    </section>
  );
}
