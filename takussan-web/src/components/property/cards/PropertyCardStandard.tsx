'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Clock, MapPin } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ContractTypeChip } from './ContractTypeChip';
import {
  FALLBACK_IMAGE,
  RENT_PERIOD_SHORT,
  type PropertyCardCommonProps,
} from './types';
import { staggerDelay } from '@/components/property/card-stagger';
import { CARD_SIZES_STANDARD_ROW } from '@/components/property/card-image-sizes';

/**
 * Standard 4:3 — variante de référence. Format proche de la PropertyCard
 * historique (TCK-038) : aspect 4/3, rounded-xl, ordre prix → titre →
 * location → méta. Adoptée par la rangée géolocalisée (« Près de toi »).
 */
export function PropertyCardStandard({
  property,
  index = 0,
  priority = false,
  sizes = CARD_SIZES_STANDARD_ROW,
}: PropertyCardCommonProps) {
  const t = useTranslations('property.cards');
  const photo = property.main_photo_url ?? FALLBACK_IMAGE;
  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = formatRelativeDate(
    property.published_at ?? property.created_at,
  );

  return (
    <article
      className="group w-[290px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <LienLocalise href={`/properties/${property.slug}`} className="block">
        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
          <Image
            src={photo}
            alt={property.title}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />

          {property.contract_type && (
            <ContractTypeChip
              type={property.contract_type}
              className="absolute top-3 left-3"
            />
          )}

          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card/90 backdrop-blur-sm text-[10px] font-medium text-foreground shadow-[0_1px_4px_rgba(31,24,18,0.10)]">
            <Clock className="size-3 opacity-70" strokeWidth={2} />
            {timeAgo}
          </div>

          <FavoriteButton
            propertyId={property.id}
            size="sm"
            className="absolute top-3 right-3"
          />
        </div>

        <div className="mt-4 space-y-1 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-0.5">
          <p className="text-primary font-bold text-[15px] tabular-nums truncate">
            {formatPrice(property.price, property.currency ?? 'XOF')}
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="ml-1 text-[12px] font-semibold text-muted-foreground">
                /{RENT_PERIOD_SHORT[property.rent_period]}
              </span>
            )}
          </p>

          <h3 className="font-display text-[15px] leading-snug font-medium text-foreground line-clamp-2 h-[2.6em]">
            {property.title}
          </h3>

          {location && (
            <p className="text-[13px] text-muted-foreground flex items-center gap-1.5 truncate">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-semibold text-muted-foreground">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <>
                <span>{t('bedroomsShort', { count: property.bedrooms })}</span>
                <span className="text-border">•</span>
              </>
            )}
            {property.area != null && (
              <>
                <span>{property.area} m²</span>
                {property.bathrooms != null && property.bathrooms > 0 && (
                  <>
                    <span className="text-border">•</span>
                    <span>{t('bathroomsShort', { count: property.bathrooms })}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </LienLocalise>
    </article>
  );
}
