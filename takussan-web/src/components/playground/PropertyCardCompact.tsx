'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import type { PropertyListItem, RentPeriod } from '@/types/property';
import { getCardPhotoUrl } from './photoFallback';
import { staggerDelay } from '@/components/property/card-stagger';

interface PropertyCardCompactProps {
  readonly property: PropertyListItem;
  readonly priority?: boolean;
  readonly index?: number;
}

const RENT_PERIOD_SHORT: Record<RentPeriod, string> = {
  daily: 'jour', weekly: 'sem.', monthly: 'mois', yearly: 'an',
};

/**
 * Variante "Compact" — carrée et dense.
 * Pour des rangées orientées scan rapide (latest, near, etc.).
 */
export function PropertyCardCompact({ property, priority, index = 0 }: PropertyCardCompactProps) {
  const [favorited, setFavorited] = useState(false);

  const quarter = property.location.quarter || property.location.city || null;
  const timeAgo = formatRelativeDate(property.published_at ?? property.created_at);
  const photoUrl = getCardPhotoUrl(property, 420, 420);

  return (
    <article
      className="pg-card pg-card-enter group w-[210px] shrink-0"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <Link href={`/properties/${property.slug}`} className="block">
        <div className="pg-card-image-wrap pg-card-image relative pg-aspect-1-1">
          <Image
            src={photoUrl}
            alt={property.title}
            fill
            sizes="210px"
            priority={priority}
            className="object-cover"
          />

          {/* Mini eyebrow temps + nouveau, top-left. */}
          <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--pg-accent-2)] text-[var(--pg-cream)] text-[10px] font-semibold">
            {timeAgo}
          </div>

          {/* Heart top-right minimal. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              setFavorited((v) => !v);
            }}
            aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={favorited}
            className="absolute top-2 right-2 size-7 rounded-full bg-[var(--pg-cream)]/95 backdrop-blur-sm flex items-center justify-center shadow-[0_1px_4px_rgba(27,40,69,0.10)]"
          >
            <Heart
              className={`size-[14px] transition-colors ${
                favorited
                  ? 'fill-[var(--pg-accent)] text-[var(--pg-accent)]'
                  : 'text-[var(--pg-ink)]'
              }`}
              strokeWidth={2}
            />
          </button>
        </div>

        <div className="pg-card-meta mt-3 px-0.5 space-y-0.5">
          <p className="text-[14px] font-bold text-[var(--pg-accent)] pg-tabular truncate">
            {formatPrice(property.price, property.currency ?? 'XOF')}
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="text-[10px] font-semibold text-[var(--pg-ink-muted)] ml-0.5">
                /{RENT_PERIOD_SHORT[property.rent_period]}
              </span>
            )}
          </p>
          <h3 className="pg-display text-[13px] leading-[17px] font-medium text-[var(--pg-ink)] line-clamp-2">
            {property.title}
          </h3>
          {quarter && (
            <p className="text-[11px] text-[var(--pg-ink-muted)] truncate pt-0.5">
              {quarter}
            </p>
          )}
          <div className="flex items-center gap-1.5 pt-0.5 text-[10px] font-medium text-[var(--pg-ink-muted)]">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <>
                <span>{property.bedrooms} ch</span>
                <span className="text-[var(--pg-hairline)]">•</span>
              </>
            )}
            {property.area != null && <span>{property.area} m²</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
