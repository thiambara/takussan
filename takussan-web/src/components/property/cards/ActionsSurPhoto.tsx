'use client';

import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { CompareToggleButton } from '@/components/compare/CompareToggleButton';
import type { ComparePreview } from '@/lib/compare';
import type { PropertyListItem } from '@/types/property';
import { cn } from '@/lib/utils';
import { AU_DESSUS_DU_LIEN } from './LienDeCarte';

/**
 * TCK-628 — le comparateur ne se montre, sur un appareil à pointeur, qu'au SURVOL de la carte (ou
 * au focus clavier, ou une fois coché). Retour du porteur : le cœur et la balance empilés sur
 * chaque photo faisaient « de gros pavés sombres » sur toutes les cartes.
 * Au doigt — `hover: none` —, rien ne change : il n'y a pas de survol pour le révéler, il reste
 * visible, comme TCK-561 l'a voulu.
 *
 * `group-hover` lit le `group` de la carte. Un bouton à opacité nulle reste focalisable, et
 * `focus-visible` le rend : la tabulation ne traverse jamais un contrôle invisible.
 */
export const REVELE_AU_SURVOL =
  '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 transition-[opacity,background-color,color,box-shadow,scale]';

/**
 * TCK-561 — la colonne d'actions posée en haut à droite de la photo des variantes de l'accueil :
 * le favori, puis le comparateur en dessous — la disposition de `PropertyCard` au bureau.
 *
 * Retour testeur du 2026-09-23 : « Pourquoi “ajouter au comparateur” n'est pas dispo sur cette
 * page ? » Les quatre variantes de `PropertyRow` (accueil, récemment consultés, portefeuille d'un
 * agent) ne portaient que le cœur, alors que la carte de la liste porte les deux. Un bien ne
 * s'ajoutait au comparateur que depuis `/properties` ou sa fiche.
 *
 * TCK-628 — des ronds de 28 px (`xs`) au lieu de 32 : les cartes des rangées sont passées de 290
 * à ~240 px au bureau et ~160 au téléphone. L'écart de 18 px (`gap-4.5`) tient toujours les zones
 * tactiles de 44 px sans chevauchement : 8 + 8 px de débord, plus 2 px d'arrondi.
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
    <div className={cn('flex shrink-0 flex-col items-center gap-4.5', AU_DESSUS_DU_LIEN, className)}>
      <FavoriteButton propertyId={property.id} size="xs" />
      {comparateur && (
        <CompareToggleButton
          propertyId={property.id}
          size="xs"
          preview={apercuComparateur(property)}
          className={REVELE_AU_SURVOL}
        />
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
