'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useDateRelative } from '@/components/property/cards/useDateRelative';
import { ContractTypeChip } from './ContractTypeChip';
import { NewBuildChip } from './NewBuildChip';
import { CardMeta } from './CardMeta';
import { PropertyPhoto } from './PropertyPhoto';
import { LienDeCarte, TITRE_REACTIF, VoileDInteraction } from './LienDeCarte';
import { ActionsSurPhoto } from './ActionsSurPhoto';
import type { PropertyCardCommonProps } from './types';
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
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = useDateRelative(property.published_at ?? property.created_at);
  const idTitre = useId();

  // TCK-554 — la racine n'est plus enveloppée d'un `<a>` : le lien est un enfant vide qui la
  // couvre (`LienDeCarte`), et le favori est son FRÈRE, posé au-dessus.
  return (
    <article
      className="group relative w-[290px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <LienDeCarte slug={property.slug} idTitre={idTitre} />

      <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
        <PropertyPhoto
          src={property.main_photo_url}
          alt={property.title}
          sizes={sizes}
          priority={priority}
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />
        {/* TCK-561 — voile de survol et d'appui (cf. `VoileDInteraction`). */}
        <VoileDInteraction />

        {/* Pastilles et cœur dans un seul flux : les pastilles passent à la ligne avant le
            cœur au lieu de passer dessous (cf. PropertyCard). */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {property.contract_type && <ContractTypeChip type={property.contract_type} />}
            <NewBuildChip condition={property.condition} />
          </div>
          {/* Favori, puis comparateur en dessous (TCK-561) — au-dessus du lien de la carte (TCK-554). */}
          <ActionsSurPhoto property={property} />
        </div>

        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card/90 backdrop-blur-sm text-xs font-medium text-foreground shadow-[0_1px_4px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)]">
          <Clock className="size-3 opacity-70" strokeWidth={2} />
          {timeAgo}
        </div>
      </div>

      <div className="mt-4 space-y-1 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-0.5">
        <p className="text-primary font-bold text-[15px] tabular-nums truncate">
          {formatPrice(property.price, property.currency ?? 'XOF')}
          {property.contract_type === 'rent' && property.rent_period && (
            <span className="ml-1 text-[12px] font-semibold text-muted-foreground">
              /{tPeriods(property.rent_period)}
            </span>
          )}
        </p>

        <h3 id={idTitre} className={`font-display text-[15px] leading-snug font-medium text-foreground line-clamp-2 h-[2.6em] text-pretty ${TITRE_REACTIF}`}>
          {property.title}
        </h3>

        {location && (
          <p className="text-[13px] text-muted-foreground flex items-center gap-1.5 truncate">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{location}</span>
          </p>
        )}

        <CardMeta
          className="pt-1 text-xs font-semibold text-muted-foreground"
          items={[
            property.bedrooms != null && property.bedrooms > 0 && t('bedroomsShort', { count: property.bedrooms }),
            property.area != null && `${property.area} m²`,
            property.bathrooms != null && property.bathrooms > 0 && t('bathroomsShort', { count: property.bathrooms }),
          ]}
        />
      </div>
    </article>
  );
}
