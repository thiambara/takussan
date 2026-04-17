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
    <div
      className={`sticky z-40 bg-white border-b border-gray-200 ${className || ''}`}
      style={{ top: '65px' }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-16">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => {
            const IconComponent = iconMap[category.icon] || Building2;
            return (
              <button
                key={category.id}
                className="group flex flex-col items-center gap-1.5 px-5 py-3.5 shrink-0
                  border-b-2 border-transparent hover:border-gray-900
                  text-gray-500 hover:text-gray-900 transition-all duration-150"
              >
                <IconComponent className="w-5 h-5" />
                <span className="text-xs font-semibold whitespace-nowrap">{category.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
