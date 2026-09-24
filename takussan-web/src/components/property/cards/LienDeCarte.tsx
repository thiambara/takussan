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

/*
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-561 — LA CARTE RÉAGIT AU POINTEUR, ET À L'APPUI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Retour testeur du 2026-09-23 (liste publique, bureau) : « Peut-on avoir une couleur un peu plus
 * différente pour le hover ? On a l'impression qu'on n'a pas cliqué. » Mesuré le jour même sur
 * `/fr/properties` à 1366 px : la couleur du titre était `rgb(31, 24, 18)` au repos, au survol ET
 * à l'appui — le seul retour était un zoom de 5 % sur la photo, qu'on ne perçoit pas en déplaçant
 * le pointeur, et rien du tout à l'appui (le seul retour au toucher, sur téléphone).
 *
 * Deux états, sur la RACINE de la carte (`group`), qui doit donc porter la classe `group` :
 * - survol : le titre passe à la couleur d'accent et se souligne — un changement de couleur ET de
 *   forme, pour ne pas reposer sur la couleur seule — et la photo se voile légèrement ;
 * - appui : le voile de la photo s'assombrit nettement pendant que le lien est `:active`.
 *
 * `group-has-[a:active]` et non `group-active` : `:active` remonte aux ancêtres, un appui sur le
 * favori ou le comparateur (frères du lien) aurait fait « s'enfoncer » toute la carte. Seul le lien
 * de la carte est un `<a>` : seul son appui la fait réagir.
 */

/** Le titre d'une carte sur fond clair : accent et soulignement au survol comme à l'appui. */
export const TITRE_REACTIF =
  'transition-colors duration-150 decoration-primary/40 underline-offset-[3px] group-hover:text-primary group-hover:underline group-has-[a:active]:text-primary group-has-[a:active]:underline';

/**
 * Le voile d'interaction de la photo. À poser DANS le conteneur de la photo (positionné, `overflow`
 * masqué), après l'image : il ne capte aucun pointeur, et les contrôles de la carte, posés
 * au-dessus du lien, restent au-dessus de lui.
 */
export function VoileDInteraction() {
  return (
    <span
      aria-hidden="true"
      data-voile-survol
      className="pointer-events-none absolute inset-0 bg-scrim/0 transition-colors duration-150 group-hover:bg-scrim/10 group-has-[a:active]:bg-scrim/25"
    />
  );
}

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
