'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useDateRelative } from '@/components/property/cards/useDateRelative';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ContractTypeChip } from './ContractTypeChip';
import { NewBuildChip } from './NewBuildChip';
import { CardMeta } from './CardMeta';
import { PropertyPhoto } from './PropertyPhoto';
import { LienDeCarte, AU_DESSUS_DU_LIEN } from './LienDeCarte';
import type { PropertyCardCommonProps } from './types';
import { staggerDelay } from '@/components/property/card-stagger';

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
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = useDateRelative(property.published_at ?? property.created_at);
  const idTitre = useId();

  // TCK-554 — la carte portait DEUX liens vers la même fiche (la photo, le titre) et le cœur
  // vivait dans le premier. Un seul lien désormais, vide, qui couvre la carte (`LienDeCarte`) ;
  // le cœur est son frère, posé au-dessus.
  return (
    <article
      className="group w-[340px] sm:w-[440px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="relative flex gap-3 sm:gap-4 items-stretch p-3 rounded-2xl bg-card border border-border hover:shadow-[0_8px_24px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)] transition-shadow">
        <LienDeCarte slug={property.slug} idTitre={idTitre} className="focus-visible:rounded-2xl" />

        <div className="shrink-0">
          <div className="relative aspect-square w-[128px] sm:w-[170px] rounded-lg overflow-hidden bg-muted">
            <PropertyPhoto
              src={property.main_photo_url}
              alt={property.title}
              sizes="(max-width: 639px) 128px, 170px"
              priority={priority}
              className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
            />

            {/* Pastilles et cœur dans un seul flux (cf. PropertyCard). */}
            <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {property.contract_type && <ContractTypeChip type={property.contract_type} compact />}
                <NewBuildChip condition={property.condition} compact />
              </div>
              <FavoriteButton propertyId={property.id} size="sm" className={`shrink-0 ${AU_DESSUS_DU_LIEN}`} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-1 pr-1">
          <div className="space-y-1">
            {/* `group-hover` et non `hover` : le lien de la carte couvre désormais le titre, qui
                ne reçoit plus le survol lui-même. */}
            <h3 id={idTitre} className="font-display text-[15px] sm:text-[16px] leading-[20px] font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
              {property.title}
            </h3>

            {location && (
              <p className="text-[12px] text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{location}</span>
              </p>
            )}

            <CardMeta
              className="pt-0.5 text-xs font-medium text-muted-foreground"
              items={[
                property.bedrooms != null && property.bedrooms > 0 && t('bedroomsShort', { count: property.bedrooms }),
                property.area != null && `${property.area} m²`,
                property.bathrooms != null && property.bathrooms > 0 && t('bathroomsShort', { count: property.bathrooms }),
              ]}
            />
          </div>

          <div>
            <p className="text-[16px] font-bold text-primary tabular-nums leading-tight">
              {formatPrice(property.price, property.currency ?? 'XOF')}
              {property.contract_type === 'rent' && property.rent_period && (
                <span className="ml-1 text-xs font-semibold text-muted-foreground">
                  /{tPeriods(property.rent_period)}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {timeAgo}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
