'use client';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { cn } from '@/lib/utils';

/**
 * TCK-554 — le lien d'une carte de bien : il couvre TOUTE la carte, ne contient RIEN, et porte le
 * titre du bien pour nom.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REMPLACE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La carte entière était un `<a>` qui contenait le favori et le comparateur. Mesuré le 2026-09-23
 * sur `/fr/properties` à 390 px : 60 `<button>` dans 30 liens (HTML invalide), et un nom de lien
 * qui lisait toute la carte, boutons compris — « Parking couvert à Pikine En vente Ajouter aux
 * favoris Ajouter au comparateur il y a 4 semaines 28 000 000 F CFA … ».
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN LIEN VIDE POSÉ PAR-DESSUS, ET PAS UN PSEUDO-ÉLÉMENT SUR LE TITRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le motif courant — le lien sur le titre, étiré par un `::after` en `inset-0` — fait dépendre la
 * surface cliquable du plus proche ancêtre POSITIONNÉ OU TRANSFORMÉ du titre. Deux variantes le
 * cassent : `Standard` et `Compact` soulèvent leur corps au survol (`translate`), ce qui fait de
 * ce corps le bloc conteneur du pseudo-élément PENDANT le survol — la photo cesserait d'être
 * cliquable exactement quand le pointeur est dessus ; `Cover` pose son titre dans une surimpression
 * `absolute`, qui le borne en permanence. Un lien enfant DIRECT de la racine n'a pas ce défaut :
 * son bloc conteneur est la racine, quoi que fassent ses frères.
 *
 * - `aria-labelledby` pointe sur le titre (`<h3 id>`) : le nom accessible est le titre, et
 *   seulement lui.
 * - `z-[1]` : le lien passe au-dessus de tout ce qui est positionné sans z-index dans la carte
 *   (photo, pastilles, surimpressions) — le toucher n'importe où ouvre la fiche. Il peut donc
 *   rester PREMIER dans le DOM, et premier dans l'ordre de tabulation.
 * - Les contrôles de la carte portent {@link AU_DESSUS_DU_LIEN} : frères du lien, jamais enfants.
 * - La cible est le RECTANGLE de la carte, comme l'était l'ancien `<a>` : l'arrondi ne s'applique
 *   qu'à l'anneau de focus.
 *
 * ⚠ La RACINE de la carte doit être positionnée (`relative`) et le lien doit en être un enfant
 * direct. Un ancêtre intermédiaire positionné réduirait la surface à cet ancêtre.
 */

/** À poser sur tout contrôle d'une carte (favori, comparateur) : au-dessus du lien, donc atteignable. */
export const AU_DESSUS_DU_LIEN = 'relative z-10';

export interface LienDeCarteProps {
  /** Slug du bien — le lien mène à sa fiche. */
  readonly slug: string;
  /** `id` de l'élément qui porte le titre du bien : il DEVIENT le nom accessible du lien. */
  readonly idTitre: string;
  /** Rayon de l'anneau de focus, aligné sur celui de la carte (`focus-visible:rounded-xl` par défaut). */
  readonly className?: string;
}

export function LienDeCarte({ slug, idTitre, className }: LienDeCarteProps) {
  return (
    <LienLocalise
      href={`/properties/${slug}`}
      aria-labelledby={idTitre}
      className={cn(
        // L'arrondi n'existe QU'AU FOCUS : un `rounded-xl` permanent rognait la cible aux quatre
        // coins — y compris en bas, sous le texte de la carte, qui n'a pas de coins visibles.
        'absolute inset-0 z-[1] focus-visible:rounded-xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    />
  );
}
