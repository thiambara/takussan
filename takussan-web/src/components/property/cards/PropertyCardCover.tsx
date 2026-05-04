'use client';

import Image from 'next/image';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ContractTypeChip } from './ContractTypeChip';
import {
  FALLBACK_IMAGE,
  RENT_PERIOD_SHORT,
  type PropertyCardCommonProps,
} from './types';

/**
 * Cover 3:4 overlay — variante magazine. Image full ratio 3/4, gradient bas,
 * titre + prix superposés en blanc. Adoptée par la rangée signature
 * « Coup de cœur » (sur fond cream + pattern bogolan).
 */
export function PropertyCardCover({
  property,
  index = 0,
  priority = false,
}: PropertyCardCommonProps) {
  const photo = property.main_photo_url ?? FALLBACK_IMAGE;
  const quarter = property.location.quarter || property.location.city || null;

  return (
    <article
      className="group w-[260px] shrink-0 animate-card-enter"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Link href={`/properties/${property.slug}`} className="block">
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-muted">
          <Image
            src={photo}
            alt={property.title}
            fill
            sizes="260px"
            priority={priority}
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />

          {/* Gradient bas pour lisibilité du texte. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-45% to-foreground/80" />

          {property.contract_type && (
            <ContractTypeChip
              type={property.contract_type}
              className="absolute top-3 left-3"
            />
          )}

          <FavoriteButton
            propertyId={property.id}
            size="sm"
            className="absolute top-3 right-3"
          />

          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            {quarter && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-white/85 mb-1.5">
                {quarter}
              </p>
            )}
            <h3 className="font-display text-[17px] leading-[22px] font-semibold line-clamp-2 mb-1.5">
              {property.title}
            </h3>
            <p className="text-[15px] font-bold tabular-nums">
              {formatPrice(property.price, property.currency ?? 'XOF')}
              {property.contract_type === 'rent' && property.rent_period && (
                <span className="ml-1 text-[12px] font-medium opacity-80">
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
