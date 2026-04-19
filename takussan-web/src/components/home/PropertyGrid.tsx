'use client';

import React from 'react';
import { PropertyCard } from './PropertyCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { PropertyListItem } from '@/types/property';

export interface PropertyGridProps {
  readonly title: string;
  readonly properties: readonly PropertyListItem[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly viewAllHref?: string;
  readonly className?: string;
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-4/3 w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function PropertyGrid({
  title,
  properties,
  loading = false,
  error = null,
  viewAllHref,
  className,
}: PropertyGridProps) {
  return (
    <section className={className}>
      <div className="flex items-end justify-between mb-5">
        <h2 className="text-xl font-bold tracking-tight text-gray-900">{title}</h2>
        {viewAllHref && (
          <a
            href={viewAllHref}
            className="text-sm font-semibold text-primary hover:underline underline-offset-4 transition-colors"
          >
            Voir plus →
          </a>
        )}
      </div>

      {error ? (
        <div className="py-12 text-center text-stone-400 text-sm">
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-15">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => <CardSkeleton key={i} />)
            : properties.map((property, i) => (
              <PropertyCard key={property.id} property={property} index={i} priority={i < 2} />
            ))}
        </div>
      )}
    </section>
  );
}
