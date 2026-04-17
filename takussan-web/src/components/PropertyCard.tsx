'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Heart, MapPin } from 'lucide-react';
import type { Property } from '@/data/mockData';

export interface PropertyCardProps {
  readonly property: Property;
  readonly index?: number;
  readonly className?: string;
}

function useReveal(ref: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

export function PropertyCard({ property, index = 0, className }: PropertyCardProps) {
  const isSale = property.transaction === 'sale';
  const [isFavorite, setIsFavorite] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useReveal(ref);

  return (
    <div
      ref={ref}
      style={{ animationDelay: `${index * 60}ms` }}
      className={`group cursor-pointer transition-opacity duration-300 ${
        visible ? 'animate-fade-in-up' : 'opacity-0'
      } ${className || ''}`}
    >
      {/* Image Container */}
      <div className="relative aspect-4/3 rounded-xl overflow-hidden mb-5">
        <Image
          src={property.image}
          alt={property.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
        />

        {/* Transaction Badge */}
        <div
          className={`absolute top-4 left-4 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-md ${
            isSale ? 'bg-[#0050cb]' : 'bg-[#2e7d32]'
          }`}
        >
          {isSale ? 'En Vente' : 'En Location'}
        </div>

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsFavorite((f) => !f);
          }}
          aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className={`absolute top-4 right-4 w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-200 ${
            isFavorite
              ? 'bg-white text-red-500'
              : 'bg-white/20 text-white hover:bg-white hover:text-[#0050cb]'
          }`}
        >
          <Heart className={`w-5 h-5 transition-all ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-2">
        <h3 className="font-bold text-lg text-gray-900">{property.title}</h3>
        <p className="text-[#0050cb] font-bold">{property.price}</p>
        <p className="text-gray-500 text-sm flex items-center gap-1">
          <MapPin className="w-4 h-4" />
          {property.location}
        </p>
        <div className="flex items-center gap-4 pt-2 text-xs font-semibold text-gray-400">
          {property.bedrooms > 0 && (
            <>
              <span>{property.bedrooms} Ch.</span>
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
            </>
          )}
          <span>{property.surface}</span>
          <span className="w-1 h-1 bg-gray-300 rounded-full" />
          <span>{property.feature}</span>
        </div>
      </div>
    </div>
  );
}
