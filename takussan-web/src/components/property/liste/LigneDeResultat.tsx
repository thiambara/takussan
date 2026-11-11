'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';

import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { LienDeCarte, TITRE_REACTIF, VoileDInteraction } from '@/components/property/cards/LienDeCarte';
import { useDateRelative } from '@/components/property/cards/useDateRelative';
import { formatPrice, cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';
import { estNouveau } from './nouveau';

/**
 * TCK-2499 — un bien de la liste en densité « Liste » : la photo de 112 px à gauche, le texte à
 * droite, le favori en bout de ligne. Quatre à cinq biens par écran de téléphone au lieu de deux.
 *
 * Ce que la ligne garde de la carte (`PropertyCard`) : le lien couvrant (`LienDeCarte`, avec le
 * marqueur d'arrivée d'un emplacement), le favori AU-DESSUS du lien, le prix et sa période — une
 * location sans période reste lue comme un loyer —, le titre comme nom du lien, le lieu, chambres
 * et surface, l'ancienneté, la mention d'une place payée en TEXTE (« Sponsorisé », « En vedette » :
 * un résultat payé ne se présente jamais comme organique, ADR-0061 §7) et le Badge acheté.
 *
 * Ce qu'elle ne porte pas : le comparateur (il reste dans la densité « Galerie » et au bureau) et
 * les pastilles sur la photo — **rien n'est posé sur une photo de 112 px**.
 */

// Le seuil de « Nouveau » est partagé avec la carte en disposition « ligne » (`PropertyCard`).
export { NOUVEAU_PENDANT_MS, estNouveau } from './nouveau';

export interface LigneDeResultatProps {
  readonly property: PropertyListItem;
  /** La place payée que la ligne occupe, s'il y en a une : la mention est du texte. */
  readonly place?: 'sponsorise' | 'vedette';
  readonly badge?: 'urgent' | 'price_drop' | null;
  readonly priority?: boolean;
  readonly className?: string;
}

export function LigneDeResultat({ property, place, badge = null, priority = false, className }: LigneDeResultatProps) {
  const t = useTranslations('property');
  const tCards = useTranslations('property.cards');
  const tListe = useTranslations('search.results.ligne');
  const idTitre = useId();
  const publie = property.published_at ?? property.created_at;
  const quand = useDateRelative(publie);
  const nouveau = estNouveau(publie);
  const lieu = [property.location.quarter, property.location.city].filter(Boolean).join(', ');
  const details = [
    lieu,
    property.bedrooms != null && property.bedrooms > 0 ? tCards('bedroomsShort', { count: property.bedrooms }) : null,
    property.area ? `${property.area} m²` : null,
  ].filter(Boolean);
  const prix = formatPrice(property.price, property.currency ?? 'XOF');

  return (
    <article
      data-ligne-resultat
      data-place={place}
      className={cn('group relative flex gap-3 py-2.5', className)}
    >
      <LienDeCarte slug={property.slug} idTitre={idTitre} />

      <div data-photo className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-muted">
        <PropertyPhoto src={property.main_photo_url} alt={property.title} compact priority={priority} sizes="112px" />
        <VoileDInteraction />
      </div>

      <div className="min-w-0 flex-1 pr-9">
        <p data-prix className="flex flex-wrap items-baseline gap-x-1 font-display text-[1.0625rem] leading-6 font-semibold tabular-nums text-foreground">
          <span className="whitespace-nowrap">{prix}</span>
          {property.contract_type === 'rent' ? (
            <span className="whitespace-nowrap font-sans text-sm font-normal text-muted-foreground">
              {property.rent_period ? `/${t(`rentPeriodsShort.${property.rent_period}`)}` : tCards('rentNoPeriod')}
            </span>
          ) : null}
        </p>
        <h3
          id={idTitre}
          title={property.title}
          className={`line-clamp-2 text-[0.9375rem] leading-5 text-foreground text-pretty ${TITRE_REACTIF}`}
        >
          {property.title}
        </h3>
        {details.length > 0 ? (
          <p className="mt-0.5 truncate text-sm leading-5 text-muted-foreground">{details.join(' · ')}</p>
        ) : null}
        <p data-meta className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] leading-5">
          {badge ? (
            <span data-badge-boost={badge} className="font-semibold text-accent">
              {tCards(badge === 'urgent' ? 'badge.urgent' : 'badge.priceDrop')}
              <span aria-hidden="true"> ·</span>
            </span>
          ) : null}
          {place ? (
            <span data-mention-payee className="text-muted-foreground">
              {tCards(place === 'sponsorise' ? 'robe.sponsored' : 'robe.featured')}
            </span>
          ) : nouveau ? (
            <span data-nouveau className="font-medium text-primary">
              {tListe('nouveau', { quand })}
            </span>
          ) : quand ? (
            <span className="text-muted-foreground">{tListe('publie', { quand })}</span>
          ) : null}
        </p>
      </div>

      {/* `absolute z-10` et non `AU_DESSUS_DU_LIEN` (`relative z-10`) : relatif, le favori reprenait
          sa place dans le flux et volait 56 px à la colonne de texte (prix sur deux lignes, mesuré). */}
      <div className="absolute -right-1.5 top-1 z-10 grid size-11 place-items-center">
        <FavoriteButton propertyId={property.id} size="sm" />
      </div>
    </article>
  );
}
