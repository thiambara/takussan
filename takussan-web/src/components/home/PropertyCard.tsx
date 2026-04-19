'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, MapPin, Clock } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import type { RentPeriod } from '@/types/property';

const RENT_PERIOD_LABEL: Record<RentPeriod, string> = {
  daily: 'jour',
  weekly: 'sem.',
  monthly: 'mois',
  yearly: 'an',
};
import type { PropertyListItem, PropertyType } from '@/types/property';

const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  apartment: 'Appartement',
  house: 'Maison',
  villa: 'Villa',
  studio: 'Studio',
  room: 'Chambre',
  land: 'Terrain',
  office: 'Bureau',
  shop: 'Boutique',
  warehouse: 'Entrepôt',
  factory: 'Usine',
  farm: 'Ferme',
  hotel: 'Hôtel',
  resort: 'Complexe',
  garage: 'Garage',
  parking: 'Parking',
  other: 'Autre',
};

const FALLBACK_IMAGE = 'https://placehold.co/800x533/e7e5e4/a8a29e?text=Photo+%C3%A0+venir';

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

export interface PropertyCardProps {
  readonly property: PropertyListItem;
  readonly index?: number;
  readonly priority?: boolean;
  readonly className?: string;
}

export function PropertyCard({ property, index = 0, priority = false, className }: PropertyCardProps) {
  const isSale = property.contract_type === 'sale';
  const [isFavorite, setIsFavorite] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useReveal(ref);

  const image = property.main_photo_url ?? FALLBACK_IMAGE;
  const location = [property.location.quarter, property.location.city].filter(Boolean).join(', ');
  const surface = property.area ? `${property.area} m²` : property.type;
  const timeAgo = formatRelativeDate(property.published_at ?? property.created_at);

  return (
    <Link href={`/properties/${property.slug}`} className="block">
      <div
        ref={ref}
        style={{ animationDelay: `${index * 60}ms` }}
        className={`group cursor-pointer transition-opacity duration-300 ${visible ? 'animate-fade-in-up' : 'opacity-0'
          } ${className || ''}`}
      >
        {/* Image Container */}
        <div className="relative aspect-4/3 rounded-xl overflow-hidden mb-5">
          <Image
            src={image}
            alt={property.title}
            fill
            priority={priority}
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />

          {/* Transaction Badge */}
          <div
            className={`absolute top-4 left-4 flex items-center gap-1.5 backdrop-blur-md text-white text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full ${isSale ? 'bg-[#0050cb]/80' : 'bg-[#2e7d32]/80'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isSale ? 'bg-sky-300' : 'bg-emerald-300'}`} />
            {isSale ? 'En vente' : 'En location'}
          </div>

          {/* Time Badge */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/50 backdrop-blur-md text-white text-[10px] font-medium px-2 py-1 rounded-full shadow-sm">
            <Clock className="w-2.5 h-2.5 opacity-80" />
            {timeAgo}
          </div>

          {/* Favorite Button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsFavorite((f) => !f);
            }}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`absolute top-4 right-4 w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-200 ${isFavorite
              ? 'bg-white text-red-500'
              : 'bg-white/20 text-white hover:bg-white hover:text-[#0050cb]'
              }`}
          >
            <Heart className={`w-5 h-5 transition-all ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-1 mt-3">
          <p className="text-[#0050cb] font-bold text-[15px] truncate" title={formatPrice(property.price, property.currency ?? 'XOF')}>
            {formatPrice(property.price, property.currency ?? 'XOF')}
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="text-sm font-semibold text-gray-400 ml-0.5">
                /{RENT_PERIOD_LABEL[property.rent_period]}
              </span>
            )}
          </p>
          <h3 className="font-semibold text-[14px] leading-snug text-gray-900 line-clamp-2 h-10" title={property.title}>
            {property.title}
          </h3>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 truncate" title={location}>
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">{location}</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-semibold text-gray-400">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <>
                <span>{property.bedrooms} Ch.</span>
                <span className="text-gray-300">&bull;</span>
              </>
            )}
            <span className="truncate">{surface}</span>
            {property.type && (
              <>
                <span className="text-gray-300">&bull;</span>
                <span className="truncate capitalize">{PROPERTY_TYPE_LABEL[property.type] || property.type}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
