'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { ContractTypeChip } from './ContractTypeChip';
import { NewBuildChip } from './NewBuildChip';
import { PropertyPhoto } from './PropertyPhoto';
import { LienDeCarte, VoileDInteraction } from './LienDeCarte';
import { ActionsSurPhoto } from './ActionsSurPhoto';
import type { PropertyCardCommonProps } from './types';
import { staggerDelay } from '@/components/property/card-stagger';
import { CARD_SIZES_RANGEE } from '@/components/property/card-image-sizes';

/**
 * Cover 3:4 overlay — variante magazine. Image full ratio 3/4, gradient bas,
 * titre + prix superposés en blanc. Adoptée par la rangée signature
 * « Coup de cœur » (sur fond cream + pattern bogolan).
 */
export function PropertyCardCover({
  property,
  index = 0,
  priority = false,
  robe,
}: PropertyCardCommonProps) {
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const tCards = useTranslations('property.cards');
  const quarter = property.location.quarter || property.location.city || null;
  const idTitre = useId();

  // TCK-554 — la racine n'est plus enveloppée d'un `<a>` : le lien est un enfant vide qui la
  // couvre (`LienDeCarte`), et le favori est son FRÈRE, posé au-dessus.
  return (
    <article
      data-robe={robe}
      className="group relative w-[260px] shrink-0 animate-card-enter"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <LienDeCarte slug={property.slug} idTitre={idTitre} />

      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
        <PropertyPhoto
          src={property.main_photo_url}
          alt={property.title}
          sizes={CARD_SIZES_RANGEE}
          priority={priority}
          ton="sombre"
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />
        {/* TCK-561 — voile de survol et d'appui (cf. `VoileDInteraction`). */}
        <VoileDInteraction />

        {/* Gradient bas pour lisibilité du texte. */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-45% to-scrim/80" />

        {/* Pastilles et cœur dans un seul flux (cf. PropertyCard). */}
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {property.contract_type && <ContractTypeChip type={property.contract_type} compact />}
            <NewBuildChip condition={property.condition} compact />
          </div>
          {/* Favori, puis comparateur en dessous (TCK-561) — au-dessus du lien de la carte (TCK-554). */}
          <ActionsSurPhoto property={property} />
        </div>

        {/* TCK-635 — la robe, DANS le cadre de la photo (la rangée défile et rognerait tout ce qui
            déborde) : un liseré terre cuite et le ruban « En vedette » au bord gauche. */}
        {robe ? (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-[3px] ring-inset ring-primary" />
            <span
              data-ruban
              className="absolute left-0 top-12 inline-flex items-center gap-1 rounded-r-full bg-primary py-0.5 pl-2 pr-2.5 text-xs font-semibold text-primary-foreground shadow-sm"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              {tCards('robe.featured')}
            </span>
          </>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
          {quarter && (
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-white/85 mb-1 truncate">
              {quarter}
            </p>
          )}
          <h3
            id={idTitre}
            // TCK-561 — blanc sur le dégradé : l'accent y perdrait le contraste, le soulignement seul.
            className="font-display text-[16px] leading-5 font-semibold line-clamp-2 mb-1 text-balance decoration-white/70 underline-offset-[3px] group-hover:underline group-has-[a:active]:underline"
          >
            {property.title}
          </h3>
          <p className="text-[14px] font-semibold tabular-nums">
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
