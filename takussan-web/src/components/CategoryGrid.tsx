'use client';

import React from 'react';
import { Building2, Home, TreePine, Store, Warehouse, Briefcase } from 'lucide-react';
import type { Category } from '@/data/mockData';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  apartment: Building2,
  villa: Home,
  terrain: TreePine,
  store: Store,
  house: Warehouse,
  business: Briefcase,
};

export interface CategoryGridProps {
  readonly categories: readonly Category[];
  readonly className?: string;
}

export function CategoryGrid({ categories, className }: CategoryGridProps) {
  return (
    <section className={className}>
      <h2 className="text-4xl font-bold tracking-tight text-gray-900 mb-12">
        Explorer par catégorie
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {categories.map((category) => {
          const IconComponent = iconMap[category.icon] || Building2;
          return (
            <button
              key={category.id}
              className="group flex flex-col items-center gap-4 p-6 rounded-2xl bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all duration-200"
            >
              <div className="w-16 h-16 rounded-full bg-[#0050cb]/10 flex items-center justify-center group-hover:bg-[#0050cb]/20 transition-colors">
                <IconComponent className="w-8 h-8 text-[#0050cb]" />
              </div>
              <span className="font-semibold text-gray-900">{category.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
