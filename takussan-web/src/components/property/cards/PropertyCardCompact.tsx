'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/utils';
import { ContractTypeChip } from './ContractTypeChip';
import { NewBuildChip } from './NewBuildChip';
import { CardMeta } from './CardMeta';
import { PropertyPhoto } from './PropertyPhoto';
import { LienDeCarte, TITRE_REACTIF, VoileDInteraction } from './LienDeCarte';
import { ActionsSurPhoto } from './ActionsSurPhoto';
import type { PropertyCardCommonProps } from './types';
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
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const quarter = property.location.quarter || property.location.city || null;
  const idTitre = useId();

  // TCK-554 — la racine n'est plus enveloppée d'un `<a>` : le lien est un enfant vide qui la
  // couvre (`LienDeCarte`), et le favori est son FRÈRE, posé au-dessus.
  return (
    <article
      className="group relative w-[210px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <LienDeCarte slug={property.slug} idTitre={idTitre} />

      <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
        <PropertyPhoto
          src={property.main_photo_url}
          alt={property.title}
          sizes="210px"
          priority={priority}
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />
        {/* TCK-561 — voile de survol et d'appui (cf. `VoileDInteraction`). */}
        <VoileDInteraction />

        {/* Pastilles et cœur dans un seul flux (cf. PropertyCard). */}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {property.contract_type && <ContractTypeChip type={property.contract_type} compact />}
            <NewBuildChip condition={property.condition} compact />
          </div>
          {/* Favori, puis comparateur en dessous (TCK-561) — au-dessus du lien de la carte (TCK-554). */}
          <ActionsSurPhoto property={property} />
        </div>
      </div>

      <div className="mt-3 space-y-0.5 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-0.5">
        <p className="text-[14px] font-bold text-primary tabular-nums truncate">
          {formatPrice(property.price, property.currency ?? 'XOF')}
          {property.contract_type === 'rent' && property.rent_period && (
            <span className="ml-1 text-xs font-semibold text-muted-foreground">
              /{tPeriods(property.rent_period)}
            </span>
          )}
        </p>
        <h3 id={idTitre} className={`font-display text-[13px] leading-[17px] font-medium text-foreground line-clamp-2 ${TITRE_REACTIF}`}>
          {property.title}
        </h3>
        {quarter && (
          <p className="text-xs text-muted-foreground truncate pt-0.5">
            {quarter}
          </p>
        )}
        <CardMeta
          className="pt-0.5 text-xs font-medium text-muted-foreground"
          items={[
            property.bedrooms != null && property.bedrooms > 0 && t('bedroomsShort', { count: property.bedrooms }),
            property.area != null && `${property.area} m²`,
          ]}
        />
      </div>
    </article>
  );
}
