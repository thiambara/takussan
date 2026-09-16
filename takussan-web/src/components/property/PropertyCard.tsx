'use client';

import React, { useState, useRef, useEffect } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { MapPin, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/utils';
import { useDateRelative } from '@/components/property/cards/useDateRelative';
import type { PropertyListItem } from '@/types/property';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { CompareToggleButton } from '@/components/compare/CompareToggleButton';
import { ContractTypeChip } from '@/components/property/cards/ContractTypeChip';
import { NewBuildChip } from '@/components/property/cards/NewBuildChip';
import { CardMeta } from '@/components/property/cards/CardMeta';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { staggerDelay } from '@/components/property/card-stagger';
import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';
import { PROPERTY_ENUM_NAMESPACES, enumLabel } from '@/components/property-form/options';
import { propertyTypeValues } from '@/lib/schemas/property';

/**
 * Canonical PropertyCard used by the homepage, search results and any
 * future discovery surface (map popup, recently-viewed, etc.).
 *
 * Wave 3 — TCK-038 / TCK-039 / TCK-047.
 *
 * Intentionally client-only: the favorite button needs access to the auth
 * context. When rendered inside a Server Component, the parent can wrap it
 * in a client boundary; inside an already-client page the cost is
 * negligible.
 */



/** Format compact des pastilles quand l'image passe sous 11rem — cf. la barre du haut. */
const PASTILLE_ETROITE =
  '@max-[11rem]:px-1.5 @max-[11rem]:py-0.5 @max-[11rem]:gap-1 @max-[11rem]:text-xs';

function useReveal(ref: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

export interface PropertyCardProps {
  readonly property: PropertyListItem;
  /** 0-based index, used for staggered reveal animations. */
  readonly index?: number;
  /** Next/Image `priority` prop — set true on above-the-fold cards only. */
  readonly priority?: boolean;
  readonly className?: string;
  /** Hide the favorite button (e.g. when the card is already inside a favourites list). */
  readonly hideFavorite?: boolean;
  /** Hide the compare toggle — defaults to visible on public discovery cards (TCK-082). */
  readonly hideCompare?: boolean;
  /**
   * `sizes` de `next/image` — **appartient à la grille appelante, pas à la carte**.
   *
   * Le défaut couvre la grille de `/properties` parce que c'est la surface
   * historique ; toute autre grille DOIT passer le sien. Les valeurs mesurées vivent
   * dans `card-image-sizes.ts`, avec le relevé qui les justifie.
   */
  readonly sizes?: string;
}

export function PropertyCard({
  property,
  index = 0,
  priority = false,
  className,
  hideFavorite = false,
  hideCompare = false,
  sizes = CARD_SIZES_SEARCH_GRID,
}: PropertyCardProps) {
  const t = useTranslations('property');
  const tCards = useTranslations('property.cards');
  // TCK-466 — le vocabulaire des types de bien s'adresse par la TABLE, jamais par un chemin
  // composé à la main. Cette carte écrivait `t(`types.${property.type}`)` sur un traducteur borné
  // à `property` : la chaîne `property.types` s'y retrouvait recopiée, en deux morceaux, hors de
  // `PROPERTY_ENUM_NAMESPACES`. `enumLabel` reconduit exactement le repli d'avant — la valeur
  // BRUTE quand elle n'est pas un type connu — sur l'appartenance à l'enum plutôt que sur
  // `t.has()` : les 16 valeurs de `propertyTypeValues` sont présentes dans les trois
  // dictionnaires (mesuré le 2026-08-29), les deux critères coïncident donc à l'écran.
  const tTypes = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const ref = useRef<HTMLDivElement>(null);
  // Priority cards (above-the-fold) skip the initial hidden state so the
  // browser can count their image as the LCP candidate immediately.
  const visible = useReveal(ref) || priority;

  const location = [property.location.quarter, property.location.city]
    .filter(Boolean)
    .join(', ');
  const timeAgo = useDateRelative(property.published_at ?? property.created_at);

  return (
    <LienLocalise href={`/properties/${property.slug}`} className="block">
      <div
        ref={ref}
        style={{ animationDelay: staggerDelay(index) }}
        className={`group cursor-pointer transition-opacity duration-300 ${
          visible ? 'animate-fade-in-up' : 'opacity-0'
        } ${className || ''}`}
      >
        {/* Image */}
        {/* `@container` : la carte se règle sur SA largeur, que la grille appelante décide —
            pas sur celle de l'écran. */}
        <div className="@container relative aspect-4/3 rounded-xl overflow-hidden bg-muted">
          <PropertyPhoto
            src={property.main_photo_url}
            alt={property.title}
            priority={priority}
            className="group-hover:scale-105 transition-transform duration-500"
            sizes={sizes}
          />

          {/* Barre du haut — pastilles à gauche, actions à droite, dans UN SEUL flux flex.
              Les pastilles étaient positionnées seules, sans bord droit : sur une carte étroite,
              « Neuf » (TCK-508) passait SOUS le cœur. Ici elles ne disposent que de la place
              que les actions leur laissent, et passent à la ligne au lieu de chevaucher — quelle
              que soit la longueur du libellé dans la locale.

              Sous 11rem d'image, cela ne suffit plus : la grille de /properties descend à
              128-146 px juste après chaque palier de colonnes (mesuré à 340, 768 et 1024 px),
              et « En vente » seule y dépasse la place laissée par un cœur de 40 px. La barre
              passe alors en format compact — marges, pastilles et cœur réduits. */}
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2 @max-[11rem]:inset-x-2 @max-[11rem]:top-2 @max-[11rem]:gap-1.5">
            {/* Transaction badge — TCK-129 : aligné sur ContractTypeChip pour cohérence site-wide.
                TCK-508 — suivi du badge « Neuf / Sur plan » quand l'état le justifie. */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 @max-[11rem]:gap-1">
              {property.contract_type && (
                <ContractTypeChip type={property.contract_type} className={PASTILLE_ETROITE} />
              )}
              <NewBuildChip condition={property.condition} className={PASTILLE_ETROITE} />
            </div>

            {/* Favorite, puis compare (TCK-082) en dessous. */}
            <div className="flex shrink-0 flex-col items-center gap-2 @max-[11rem]:gap-1.5">
              {!hideFavorite && (
                <FavoriteButton
                  propertyId={property.id}
                  className="@max-[11rem]:size-8 @max-[11rem]:[&_svg]:size-4"
                />
              )}
              {!hideCompare && (
                <CompareToggleButton
                  propertyId={property.id}
                  size="sm"
                  // L'aperçu que la barre flottante affichera. La carte l'a déjà sous la main :
                  // le lui passer coûte trois champs et évite une requête par page montée.
                  preview={{
                    title: property.title,
                    slug: property.slug,
                    photo: property.main_photo_url,
                  }}
                />
              )}
            </div>
          </div>

          {/* Time */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-scrim/60 backdrop-blur-md text-primary-foreground text-xs font-medium px-2 py-1 rounded-full shadow-sm">
            <Clock className="size-3 opacity-80" aria-hidden="true" />
            {timeAgo}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-1 mt-3.5">
          {/* `flex-wrap` et non `truncate` : à 360 px, « 2 090 000 F CFA /mois » perdait sa
              période (« /m… »), l'information qui distingue un loyer d'un prix. */}
          <p
            className="flex flex-wrap items-baseline gap-x-0.5 text-primary font-bold text-[15px] tabular-nums"
            title={formatPrice(property.price, property.currency ?? 'XOF')}
          >
            <span className="whitespace-nowrap">{formatPrice(property.price, property.currency ?? 'XOF')}</span>
            {property.contract_type === 'rent' && property.rent_period && (
              <span className="whitespace-nowrap text-sm font-semibold text-muted-foreground">
                /{t(`rentPeriodsShort.${property.rent_period}`)}
              </span>
            )}
          </p>
          <h3
            className="font-display font-semibold text-[14px] leading-snug text-foreground line-clamp-2 h-10 text-pretty"
            title={property.title}
          >
            {property.title}
          </h3>
          <p
            className="text-muted-foreground text-sm flex items-center gap-1.5 truncate"
            title={location}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">{location}</span>
          </p>
          <CardMeta
            className="pt-1 text-xs font-semibold text-muted-foreground"
            items={[
              property.bedrooms != null && property.bedrooms > 0 && tCards('bedroomsAbbrev', { count: property.bedrooms }),
              property.area ? `${property.area} m²` : null,
              property.type && enumLabel(tTypes, propertyTypeValues, property.type),
            ]}
          />
        </div>
      </div>
    </LienLocalise>
  );
}
