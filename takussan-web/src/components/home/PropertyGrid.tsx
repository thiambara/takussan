'use client';

import React from 'react';
import { PropertyCard } from './PropertyCard';
import type { Property } from '@/data/mockData';

export interface PropertyGridProps {
  readonly title: string;
  readonly properties: readonly Property[];
  readonly viewAllHref?: string;
  readonly className?: string;
}

export function PropertyGrid({
  title,
  properties,
  viewAllHref,
  className,
}: PropertyGridProps) {

  return (
    <section className={className}>
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <h2 className="text-xl font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        <div className="flex items-center gap-4">
          {viewAllHref && (
            <a
              href={viewAllHref}
              className="text-sm font-semibold text-[#0050cb] hover:underline underline-offset-4 transition-colors"
            >
              Voir plus →
            </a>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-8">
        {properties.map((property, i) => (
          <PropertyCard key={property.id} property={property} index={i} />
        ))}
      </div>
    </section>
  );
}
