/**
 * Styles partagés par la barre latérale de `/app` (`AppSidebar`) et ses blocs (« Aujourd'hui »,
 * `DemarrerDeLEspace`, les lignes de statut) : une seule définition, pour qu'aucun bloc neuf ne perde
 * l'anneau de focus que TCK-377 a dû ajouter partout.
 *
 * TCK-2490 (ADR-0090 §1) — la colonne « Atelier » : lignes de 36 px (40 px au doigt, dans le tiroir),
 * coins `rounded-lg`, texte de 14 px, icônes de 18 px au trait 1,75 ; l'actif marqué par un voile
 * d'encre à 8 % et l'icône en couleur primaire, le survol par un voile à 5 %. Les contrastes de ces
 * couples sont MESURÉS sur les jetons, clair et sombre (`AppSidebar.contraste.test.tsx`).
 */

/**
 * TCK-377 — Anneau de focus sur toutes les cibles cliquables de la barre.
 *
 * Il n'y en avait AUCUN : au clavier, seul le contour par défaut du navigateur subsistait. Le jeton
 * `--ring` mesure, sur le fond de la colonne (`--muted` à 45 % sur `--background`), 4,81:1 en clair et
 * 4,73:1 en sombre ; sur le voile de l'entrée ACTIVE, 4,10:1 et 3,74:1 — au-dessus du seuil non
 * textuel de 3:1 partout (TCK-2490, mesuré sur les jetons).
 */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * TCK-2490 — l'anneau RENTRANT des lignes : elles vivent dans des listes qui se replient en
 * `overflow-hidden` (repli animé) — un anneau sortant y serait coupé sur ses bords.
 */
export const FOCUS_RING_RENTRANT = `${FOCUS_RING} focus-visible:ring-inset`;

/**
 * TCK-2490 (ADR-0090 §1) — le titre d'un groupe : casse de phrase, 12,5 px, discret. L'ancien style
 * (capitales espacées) est celui que le porteur a jugé « moche » le 2026-11-06.
 */
export const STYLE_TITRE = 'text-[12.5px] font-medium text-muted-foreground';

/** TCK-2490 — la boîte d'une ligne (lien, ligne cadenassée, « Aller à ») : 36 px, 40 px au doigt. */
export const STYLE_LIGNE =
  'flex h-9 min-w-0 items-center gap-3 rounded-lg px-2.5 text-[14px] max-md:h-10 icones:justify-center icones:px-0';

/** TCK-2490 — la ligne au repos et au survol (voile d'encre à 5 %). */
export const STYLE_LIGNE_REPOS = 'text-foreground/80 hover:bg-foreground/5 hover:text-foreground';

/** TCK-2490 — la ligne active : voile d'encre à 8 %, libellé appuyé. */
export const STYLE_LIGNE_ACTIVE = 'bg-foreground/8 font-medium text-foreground';

/** TCK-2490 — une icône de ligne : 18 px, trait 1,75 (passé en prop `strokeWidth`). */
export const ICONE_DE_LIGNE = 'size-[18px] shrink-0';
export const TRAIT_D_ICONE = 1.75;

/**
 * TCK-2490 — un compteur : des chiffres, pas une pastille pleine. `primary-deep` et non `primary` :
 * mesuré sur les jetons, `primary` tombe à 4,10:1 (clair) et 3,74:1 (sombre) sur le voile de l'entrée
 * active, sous les 4,5:1 d'un texte ; `primary-deep` tient 6,19:1 et 4,77:1 (`AppSidebar.contraste`).
 */
export const STYLE_COMPTEUR = 'ml-auto shrink-0 text-[12.5px] font-medium tabular-nums text-primary-deep';

/**
 * TCK-2480 — l'épingle d'une ligne : discrète, visible au survol de la ligne ET au focus clavier,
 * toujours visible quand la ligne est épinglée (on reconnaît « Épinglés ») ; à 60 % sur un écran
 * tactile, qui n'a pas de survol (A13).
 */
export const STYLE_EPINGLE =
  'mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 group-hover/ligne:opacity-100 aria-pressed:opacity-100 aria-disabled:cursor-not-allowed tactile:not-aria-pressed:opacity-60 max-md:size-9 motion-reduce:transition-none icones:hidden';

/** TCK-2480 — le libellé d'une ligne : lu par le lecteur d'écran dans tous les modes, caché à l'œil réduite. */
export const LIBELLE_DE_LIGNE = 'truncate icones:sr-only';

/**
 * TCK-2490 — le repli animé d'une liste (groupe, « Plus ») : la hauteur passe par `grid-template-rows`
 * (0fr ↔ 1fr), 300 ms sur une sortie exponentielle ; rien sous `prefers-reduced-motion`.
 */
export const STYLE_REPLI =
  'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none';
