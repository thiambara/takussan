'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { formatPrice, formatRelativeDate } from '@/lib/utils';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ContractTypeChip } from './ContractTypeChip';
import {
  FALLBACK_IMAGE,
  RENT_PERIOD_SHORT,
  type PropertyCardCommonProps,
} from './types';

/**
 * Listing horizontal — image carrée à gauche, méta à droite.
 * Format adapté aux rangées orientées parcours rapide (« À louer »).
 */
export function PropertyCardListing({
  property,
  index = 0,
  priority = false,
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
      className="group w-[440px] shrink-0 animate-card-enter"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex gap-4 items-stretch p-3 rounded-2xl bg-card border border-border hover:shadow-[0_8px_24px_rgba(31,24,18,0.08)] transition-shadow">
        <Link href={`/properties/${property.slug}`} className="block shrink-0">
          <div className="relative aspect-square w-[170px] rounded-xl overflow-hidden bg-muted">
            <Image
              src={photo}
              alt={property.title}
              fill
              sizes="170px"
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
        </Link>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-1 pr-1">
          <div className="space-y-1">
            <Link href={`/properties/${property.slug}`}>
              <h3 className="font-display text-[16px] leading-[20px] font-semibold text-foreground line-clamp-2">
                {property.title}
              </h3>
            </Link>

            {location && (
              <p className="text-[12px] text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{location}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[11px] font-medium text-muted-foreground">
              {property.bedrooms != null && property.bedrooms > 0 && (
                <span>{t('bedroomsShort', { count: property.bedrooms })}</span>
              )}
              {property.area != null && (
                <>
                  <span className="text-border">•</span>
                  <span>{property.area} m²</span>
                </>
              )}
              {property.bathrooms != null && property.bathrooms > 0 && (
                <>
                  <span className="text-border">•</span>
                  <span>{t('bathroomsShort', { count: property.bathrooms })}</span>
                </>
              )}
            </div>
          </div>

          <div>
            <p className="text-[16px] font-bold text-primary tabular-nums leading-tight">
              {formatPrice(property.price, property.currency ?? 'XOF')}
              {property.contract_type === 'rent' && property.rent_period && (
                <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
                  /{RENT_PERIOD_SHORT[property.rent_period]}
                </span>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {timeAgo}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
