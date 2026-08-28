'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { formatPrice } from '@/lib/utils';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ContractTypeChip } from './ContractTypeChip';
import {
  FALLBACK_IMAGE,
  RENT_PERIOD_SHORT,
  type PropertyCardCommonProps,
} from './types';
import { staggerDelay } from '@/components/property/card-stagger';

/**
 * Compact 1:1 — variante carrée et dense. Format orienté scan rapide
 * (« Tout juste publié »).
 */
export function PropertyCardCompact({
  property,
  index = 0,
  priority = false,
}: PropertyCardCommonProps) {
  const t = useTranslations('property.cards');
  const photo = property.main_photo_url ?? FALLBACK_IMAGE;
  const quarter = property.location.quarter || property.location.city || null;

  return (
    <article
      className="group w-[210px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <LienLocalise href={`/properties/${property.slug}`} className="block">
        <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
          <Image
            src={photo}
            alt={property.title}
            fill
            sizes="210px"
            priority={priority}
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />

          {property.contract_type && (
            <ContractTypeChip
              type={property.contract_type}
              compact
              className="absolute top-2 left-2"
            />
          )}

          <FavoriteButton
            propertyId={property.id}
            size="sm"
            className="absolute top-2 right-2"
          />
        </div>

        <div className="mt-3 space-y-0.5 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-0.5">
          <p className="text-[14px] font-bold text-primary tabular-nums truncate">
            {formatPrice(property.price, property.currency ?? 'XOF')}
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                /{RENT_PERIOD_SHORT[property.rent_period]}
              </span>
            )}
          </p>
          <h3 className="font-display text-[13px] leading-[17px] font-medium text-foreground line-clamp-2">
            {property.title}
          </h3>
          {quarter && (
            <p className="text-[11px] text-muted-foreground truncate pt-0.5">
              {quarter}
            </p>
          )}
          <div className="flex items-center gap-1.5 pt-0.5 text-[10px] font-medium text-muted-foreground">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <>
                <span>{t('bedroomsShort', { count: property.bedrooms })}</span>
                <span className="text-border">•</span>
              </>
            )}
            {property.area != null && <span>{property.area} m²</span>}
          </div>
        </div>
      </LienLocalise>
    </article>
  );
}
