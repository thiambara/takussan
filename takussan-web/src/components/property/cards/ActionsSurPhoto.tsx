'use client';

import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { CompareToggleButton } from '@/components/compare/CompareToggleButton';
import type { ComparePreview } from '@/lib/compare';
import type { PropertyListItem } from '@/types/property';
import { cn } from '@/lib/utils';
import { AU_DESSUS_DU_LIEN } from './LienDeCarte';

/**
 * TCK-561 — la colonne d'actions posée en haut à droite de la photo des variantes de l'accueil :
 * le favori, puis le comparateur en dessous — la disposition de `PropertyCard` au bureau.
 *
 * Retour testeur du 2026-09-23 : « Pourquoi “ajouter au comparateur” n'est pas dispo sur cette
 * page ? » Les quatre variantes de `PropertyRow` (accueil, récemment consultés, portefeuille d'un
 * agent) ne portaient que le cœur, alors que la carte de la liste porte les deux. Un bien ne
 * s'ajoutait au comparateur que depuis `/properties` ou sa fiche.
 *
 * L'écart de 14 px (`gap-3.5`) tient les zones tactiles de 44 px sans chevauchement entre deux
 * ronds de 32 px (6 + 6 px de débord, plus 2 px d'arrondi — cf. `PropertyCard`, format compact).
 *
 * ⚠ La colonne porte {@link AU_DESSUS_DU_LIEN} : les deux boutons sont FRÈRES du lien de la carte,
 * jamais ses enfants (TCK-554).
 */
export function ActionsSurPhoto({
  property,
  comparateur = true,
  className,
}: {
  readonly property: PropertyListItem;
  /** `false` quand la variante pose le comparateur ailleurs (`Listing` : dans la rangée du prix). */
  readonly comparateur?: boolean;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 flex-col items-center gap-3.5', AU_DESSUS_DU_LIEN, className)}>
      <FavoriteButton propertyId={property.id} size="sm" />
      {comparateur && (
        <CompareToggleButton propertyId={property.id} size="sm" preview={apercuComparateur(property)} />
      )}
    </div>
  );
}

/**
 * L'aperçu que la barre flottante du comparateur affichera — titre, slug, photo, que la carte a
 * déjà sous la main. Sans lui, la barre retomberait sur l'initiale du bien.
 */
export function apercuComparateur(property: PropertyListItem): ComparePreview {
  return { title: property.title, slug: property.slug, photo: property.main_photo_url };
}
