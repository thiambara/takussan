'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { PropertyListItem, RentPeriod } from '@/types/property';
import { getCardPhotoUrl } from './photoFallback';

interface PropertyCardOverlayProps {
  readonly property: PropertyListItem;
  readonly priority?: boolean;
  readonly index?: number;
}

const RENT_PERIOD_SHORT: Record<RentPeriod, string> = {
  daily: 'jour', weekly: 'sem.', monthly: 'mois', yearly: 'an',
};

/**
 * Variante "Overlay" — façon couverture magazine.
 * Image full ratio 3/4, gradient bas, titre + prix superposés en blanc.
 */
export function PropertyCardOverlay({ property, priority, index = 0 }: PropertyCardOverlayProps) {
  const [favorited, setFavorited] = useState(false);

  const quarter = property.location.quarter || property.location.city || null;
  const photoUrl = getCardPhotoUrl(property, 520, 700);

  return (
    <article
      className="pg-card pg-card-enter group w-[260px] shrink-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Link href={`/properties/${property.slug}`} className="block">
        <div className="pg-card-image-wrap pg-card-image relative pg-aspect-3-4">
          <Image
            src={photoUrl}
            alt={property.title}
            fill
            sizes="260px"
            priority={priority}
            className="object-cover"
          />

          {/* Gradient bas pour lisibilité du texte. */}
          <div className="pg-overlay-gradient absolute inset-0" />

          {/* Eyebrow featured top-left. */}
          {property.featured && (
            <div className="absolute top-3 left-3">
              <span
                className="pg-eyebrow inline-flex items-center px-2.5 py-1 rounded-full bg-[var(--pg-accent)] text-[var(--pg-cream)] shadow-[0_2px_6px_rgba(0,0,0,0.20)]"
              >
                Coup de cœur
              </span>
            </div>
          )}

          {/* Heart outline blanc — pas de cercle (style éditorial). */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              setFavorited((v) => !v);
            }}
            aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={favorited}
            className="absolute top-3 right-3 p-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Heart
              className={`size-5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition-colors ${
                favorited ? 'fill-[var(--pg-accent)] text-[var(--pg-accent)]' : 'text-white'
              }`}
              strokeWidth={1.75}
            />
          </button>

          {/* Texte superposé en bas. */}
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            {quarter && (
              <p className="pg-eyebrow text-white/85 mb-1.5">{quarter}</p>
            )}
            <h3 className="pg-display text-[17px] leading-[22px] font-semibold line-clamp-2 mb-1.5">
              {property.title}
            </h3>
            <p className="text-[15px] font-bold pg-tabular">
              {formatPrice(property.price, property.currency ?? 'XOF')}
              {property.contract_type === 'rent' && property.rent_period && (
                <span className="text-[12px] font-medium opacity-80 ml-0.5">
                  /{RENT_PERIOD_SHORT[property.rent_period]}
                </span>
              )}
            </p>
          </div>
        </div>
      </Link>
    </article>
  );
}
