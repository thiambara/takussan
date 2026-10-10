'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
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
import { CARD_SIZES_RANGEE } from '@/components/property/card-image-sizes';

/**
 * Standard — variante de référence, adoptée par « Près de toi », « À vendre » et « Récemment
 * consultés ».
 *
 * TCK-628 — redessinée sur le modèle d'Airbnb, à la demande du porteur : photo CARRÉE d'abord
 * (`rounded-2xl`), puis un bloc de texte serré qui se lit de haut en bas — titre, lieu, détails,
 * prix. Elle était en 4:3 avec le prix en tête et l'ancienneté en pastille sur la photo ; la
 * pastille est devenue un élément de la ligne de détails, la photo ne porte plus que la
 * transaction (à gauche) et les actions (à droite).
 */
export function PropertyCardStandard({
  property,
  index = 0,
  priority = false,
  sizes = CARD_SIZES_RANGEE,
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

      <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted">
        <PropertyPhoto
          src={property.main_photo_url}
          alt={property.title}
          sizes={sizes}
          priority={priority}
          className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
        />
        {/* TCK-561 — voile de survol et d'appui (cf. `VoileDInteraction`). */}
        <VoileDInteraction />

        {/* Pastilles et cœur dans un seul flux : les pastilles passent à la ligne avant le
            cœur au lieu de passer dessous (cf. PropertyCard). */}
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {property.contract_type && <ContractTypeChip type={property.contract_type} compact />}
            <NewBuildChip condition={property.condition} compact />
          </div>
          {/* Favori, puis comparateur en dessous (TCK-561) — au-dessus du lien de la carte (TCK-554). */}
          <ActionsSurPhoto property={property} />
        </div>
      </div>

      <div className="mt-2.5 space-y-0.5">
        <h3
          id={idTitre}
          title={property.title}
          className={`font-display text-[15px] leading-5 font-semibold text-foreground truncate ${TITRE_REACTIF}`}
        >
          {property.title}
        </h3>

        {location && (
          <p className="text-[13px] leading-[18px] text-muted-foreground truncate" title={location}>
            {location}
          </p>
        )}

        <CardMeta
          className="text-[13px] leading-[18px] text-muted-foreground"
          items={[
            property.bedrooms != null && property.bedrooms > 0 && t('bedroomsShort', { count: property.bedrooms }),
            property.area != null && `${property.area} m²`,
            timeAgo,
          ]}
        />

        <p className="pt-0.5 text-[14px] leading-5 font-semibold text-foreground tabular-nums truncate">
          {formatPrice(property.price, property.currency ?? 'XOF')}
          {property.contract_type === 'rent' && property.rent_period && (
            <span className="ml-0.5 font-normal text-muted-foreground">
              /{tPeriods(property.rent_period)}
            </span>
          )}
        </p>
      </div>
    </article>
  );
}
