'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/utils';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ContractTypeChip } from './ContractTypeChip';
import { NewBuildChip } from './NewBuildChip';
import { PropertyPhoto } from './PropertyPhoto';
import { LienDeCarte, AU_DESSUS_DU_LIEN } from './LienDeCarte';
import type { PropertyCardCommonProps } from './types';
import { staggerDelay } from '@/components/property/card-stagger';

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
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const quarter = property.location.quarter || property.location.city || null;
  const idTitre = useId();

  // TCK-554 — la racine n'est plus enveloppée d'un `<a>` : le lien est un enfant vide qui la
  // couvre (`LienDeCarte`), et le favori est son FRÈRE, posé au-dessus.
  return (
    <article
      className="group relative w-[260px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <LienDeCarte slug={property.slug} idTitre={idTitre} />

      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-muted">
        <PropertyPhoto
          src={property.main_photo_url}
          alt={property.title}
          sizes="260px"
          priority={priority}
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />

        {/* Gradient bas pour lisibilité du texte. */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-45% to-scrim/80" />

        {/* Pastilles et cœur dans un seul flux (cf. PropertyCard). */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {property.contract_type && <ContractTypeChip type={property.contract_type} />}
            <NewBuildChip condition={property.condition} />
          </div>
          <FavoriteButton propertyId={property.id} size="sm" className={`shrink-0 ${AU_DESSUS_DU_LIEN}`} />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          {quarter && (
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-white/85 mb-1.5">
              {quarter}
            </p>
          )}
          <h3 id={idTitre} className="font-display text-[17px] leading-[22px] font-semibold line-clamp-2 mb-1.5 text-balance">
            {property.title}
          </h3>
          <p className="text-[15px] font-bold tabular-nums">
            {formatPrice(property.price, property.currency ?? 'XOF')}
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="ml-1 text-[12px] font-medium opacity-80">
                /{tPeriods(property.rent_period)}
              </span>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}
