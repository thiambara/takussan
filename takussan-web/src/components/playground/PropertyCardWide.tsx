'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MapPin } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import type { PropertyListItem, RentPeriod } from '@/types/property';
import { getCardPhotoUrl } from './photoFallback';

interface PropertyCardWideProps {
  readonly property: PropertyListItem;
  readonly priority?: boolean;
  readonly index?: number;
}

const RENT_PERIOD_SHORT: Record<RentPeriod, string> = {
  daily: 'jour', weekly: 'sem.', monthly: 'mois', yearly: 'an',
};

/**
 * Variante "Wide" — image carrée à gauche, méta à droite.
 * Format adapté aux rangées géolocalisées (rythme list-like).
 */
export function PropertyCardWide({ property, priority, index = 0 }: PropertyCardWideProps) {
  const [favorited, setFavorited] = useState(false);

  const isSale = property.contract_type === 'sale';
  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = formatRelativeDate(property.published_at ?? property.created_at);
  const photoUrl = getCardPhotoUrl(property, 400, 400);

  return (
    <article
      className="pg-card pg-card-enter group w-[440px] shrink-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex gap-4 items-stretch p-3 rounded-2xl bg-[var(--pg-cream)] border border-[var(--pg-hairline)] hover:shadow-[0_8px_24px_rgba(27,40,69,0.08)] transition-shadow">
        <Link href={`/properties/${property.slug}`} className="block shrink-0">
          <div className="pg-card-image-wrap pg-card-image relative pg-aspect-1-1 w-[170px]">
            <Image
              src={photoUrl}
              alt={property.title}
              fill
              sizes="170px"
              priority={priority}
              className="object-cover"
            />

            {property.contract_type && (
              <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isSale ? 'pg-badge-tx-sale' : 'pg-badge-tx-rent'
              }`}>
                {isSale ? 'Vente' : 'Location'}
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-1 pr-1">
          <div className="space-y-1">
            <Link href={`/properties/${property.slug}`}>
              <h3 className="pg-display text-[16px] leading-[20px] font-semibold text-[var(--pg-ink)] line-clamp-2">
                {property.title}
              </h3>
            </Link>

            {location && (
              <p className="text-[12px] text-[var(--pg-ink-muted)] flex items-center gap-1 truncate">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{location}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[11px] font-medium text-[var(--pg-ink-muted)]">
              {property.bedrooms != null && property.bedrooms > 0 && (
                <span>{property.bedrooms} ch</span>
              )}
              {property.area != null && (
                <>
                  <span className="text-[var(--pg-hairline)]">•</span>
                  <span>{property.area} m²</span>
                </>
              )}
              {property.bathrooms != null && property.bathrooms > 0 && (
                <>
                  <span className="text-[var(--pg-hairline)]">•</span>
                  <span>{property.bathrooms} sdb</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[16px] font-bold text-[var(--pg-accent)] pg-tabular leading-tight">
                {formatPrice(property.price, property.currency ?? 'XOF')}
                {property.contract_type === 'rent' && property.rent_period && (
                  <span className="text-[11px] font-semibold text-[var(--pg-ink-muted)] ml-0.5">
                    /{RENT_PERIOD_SHORT[property.rent_period]}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-[var(--pg-ink-muted)] mt-0.5">{timeAgo}</p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                setFavorited((v) => !v);
              }}
              aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              aria-pressed={favorited}
              className="size-8 rounded-full border border-[var(--pg-hairline)] flex items-center justify-center hover:border-[var(--pg-accent)] transition-colors shrink-0"
            >
              <Heart
                className={`size-4 transition-colors ${
                  favorited
                    ? 'fill-[var(--pg-accent)] text-[var(--pg-accent)]'
                    : 'text-[var(--pg-ink)]'
                }`}
                strokeWidth={2}
              />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
