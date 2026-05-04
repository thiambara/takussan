'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MapPin, Clock } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import type { PropertyListItem, RentPeriod } from '@/types/property';
import { getCardPhotoUrl } from './photoFallback';

interface PropertyCardLocalProps {
  readonly property: PropertyListItem;
  readonly priority?: boolean;
  readonly index?: number;
}

const RENT_PERIOD_SHORT: Record<RentPeriod, string> = {
  daily: 'jour',
  weekly: 'sem.',
  monthly: 'mois',
  yearly: 'an',
};

/**
 * Variante "Standard" — dimensions et ordre alignés sur la PropertyCard
 * canonique de l'app (aspect 4/3, rounded-xl, prix → titre → location → méta).
 * Différence : palette Ancrage Local + typo Bricolage / DM Sans.
 */
export function PropertyCardLocal({ property, priority, index = 0 }: PropertyCardLocalProps) {
  const [favorited, setFavorited] = useState(false);
  const [pulse, setPulse] = useState(false);

  const isSale = property.contract_type === 'sale';
  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = formatRelativeDate(
    property.published_at ?? property.created_at,
  );
  const photoUrl = getCardPhotoUrl(property, 600, 450);

  return (
    <article
      className="pg-card pg-card-enter group w-[290px] shrink-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Link href={`/properties/${property.slug}`} className="block">
        <div className="pg-card-image-wrap pg-card-image relative pg-aspect-4-3">
          <Image
            src={photoUrl}
            alt={property.title}
            fill
            sizes="290px"
            priority={priority}
            className="object-cover"
          />

          {/* Badge transaction — top-left */}
          {property.contract_type && (
            <div className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md text-[11px] font-semibold ${
              isSale ? 'pg-badge-tx-sale' : 'pg-badge-tx-rent'
            }`}>
              <span className="size-1.5 rounded-full bg-current opacity-70" />
              {isSale ? 'En vente' : 'En location'}
            </div>
          )}

          {/* Time — bottom-left */}
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--pg-cream)]/90 backdrop-blur-sm text-[10px] font-medium text-[var(--pg-ink)] shadow-[0_1px_4px_rgba(27,40,69,0.10)]">
            <Clock className="size-3 opacity-70" strokeWidth={2} />
            {timeAgo}
          </div>

          {/* Heart — top-right */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              setFavorited((v) => !v);
              setPulse(true);
              window.setTimeout(() => setPulse(false), 320);
            }}
            aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={favorited}
            className="absolute top-3 right-3 size-9 rounded-full bg-[var(--pg-cream)]/95 backdrop-blur-sm flex items-center justify-center shadow-[0_2px_8px_rgba(27,40,69,0.10)] hover:bg-[var(--pg-cream)] transition-colors"
          >
            <Heart
              className={`size-[18px] transition-colors ${pulse ? 'pg-heart-pulse' : ''} ${
                favorited
                  ? 'fill-[var(--pg-accent)] text-[var(--pg-accent)]'
                  : 'text-[var(--pg-ink)]'
              }`}
              strokeWidth={2}
            />
          </button>
        </div>

        {/* Body — ordre prix → titre → location → méta (alignement app). */}
        <div className="pg-card-meta mt-4 space-y-1">
          <p className="text-[var(--pg-accent)] font-bold text-[15px] pg-tabular truncate">
            {formatPrice(property.price, property.currency ?? 'XOF')}
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="text-[12px] font-semibold text-[var(--pg-ink-muted)] ml-0.5">
                /{RENT_PERIOD_SHORT[property.rent_period]}
              </span>
            )}
          </p>

          <h3 className="pg-display font-medium text-[14px] leading-snug text-[var(--pg-ink)] line-clamp-2 h-10">
            {property.title}
          </h3>

          {location && (
            <p className="text-[13px] text-[var(--pg-ink-muted)] flex items-center gap-1.5 truncate">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-semibold text-[var(--pg-ink-muted)]">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <>
                <span>{property.bedrooms} ch</span>
                <span className="text-[var(--pg-hairline)]">•</span>
              </>
            )}
            {property.area != null && (
              <>
                <span>{property.area} m²</span>
                {property.bathrooms != null && property.bathrooms > 0 && (
                  <>
                    <span className="text-[var(--pg-hairline)]">•</span>
                    <span>{property.bathrooms} sdb</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
