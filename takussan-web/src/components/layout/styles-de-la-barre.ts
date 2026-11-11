/**
 * Styles partagés par la barre latérale de `/app` (`AppSidebar`) et ses blocs (« Aujourd'hui »,
 * `DemarrerDeLEspace`, les lignes de statut) : une seule définition, pour qu'aucun bloc neuf ne perde
 * l'anneau de focus que TCK-377 a dû ajouter partout.
 *
 * TCK-2490 (ADR-0090 §1) — la colonne « Atelier » : lignes de 36 px (40 px au doigt, dans le tiroir),
 * coins `rounded-lg` ; l'actif marqué par un voile d'encre à 8 % et l'icône en couleur primaire, le
 * survol par un voile à 5 %. TCK-2691 (ADR-0106) — aux cotes de la maquette : texte `text-sm` (12,6 px
 * dès `lg`), 15 px dans le tiroir ; icônes de 18 px (20 dans le tiroir) au trait 1,5, `muted-foreground`
 * au repos ; encre douce opaque au repos. Les contrastes de ces
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
 * TCK-2490 (ADR-0090 §1) — le titre d'un groupe : casse de phrase, discret. L'ancien style (capitales
 * espacées) est celui que le porteur a jugé « moche » le 2026-11-06.
 *
 * TCK-2691 (C8) — `text-xs` (10,8 px dès `lg`), graisse 400, comme la maquette.
 */
export const STYLE_TITRE = 'text-xs text-muted-foreground';

/**
 * TCK-2490 — la boîte d'une ligne (lien, ligne cadenassée, « Aller à ») : 36 px, 40 px au doigt.
 *
 * TCK-2691 (ADR-0106, C8) — les cotes de la maquette : `text-sm` (12,6 px dès `lg`, sur l'échelle de
 * densité), `px-2` et `gap-2.5` ; dans le tiroir (sous `md`), le texte de 15 px (`text-corps`). La hauteur
 * des lignes du tiroir (44 px) est à TCK-2619.
 */
export const STYLE_LIGNE =
  'flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-2 text-sm max-md:h-10 max-md:text-corps icones:justify-center icones:px-0';

/**
 * TCK-2490 — la ligne au repos et au survol (voile d'encre à 5 %). Une encre de texte ne s'atténue pas
 * par l'opacité (TCK-658, P07.02 — `encre-sans-alpha.contraste.test.ts`).
 *
 * TCK-2691 (C9) — l'encre au repos est l'encre DOUCE de TCK-2685, opaque : la valeur majoritaire des
 * maquettes (`foreground/85` ici, `/80` ailleurs) rendue sans alpha. L'entrée active reste à l'encre pleine.
 */
export const ENCRE_AU_REPOS = 'text-encre-douce';
export const STYLE_LIGNE_REPOS = `${ENCRE_AU_REPOS} hover:bg-foreground/5`;

/** TCK-2490 — la ligne active : voile d'encre à 8 %, libellé appuyé. */
export const STYLE_LIGNE_ACTIVE = 'bg-foreground/8 font-medium text-foreground';

/**
 * TCK-2490 — une icône de ligne : 18 px (20 px dans le tiroir, sous `md` — TCK-2691, C8), trait passé
 * en prop `strokeWidth`.
 *
 * TCK-2691 (C9, décidé par le porteur le 2026-11-10, amende TCK-2490) — le trait de la maquette, 1,5,
 * colonne et tiroir.
 */
export const ICONE_DE_LIGNE = 'size-[18px] shrink-0 max-md:size-5';
export const TRAIT_D_ICONE = 1.5;

/**
 * TCK-2691 (C6) — l'encre d'une icône de ligne : `muted-foreground` au repos, `primary` sur l'entrée
 * active. Non textuelles : ≥ 3:1 sur leurs fonds, clair et sombre (`AppSidebar.contraste`).
 */
export const ENCRE_D_ICONE_REPOS = 'text-muted-foreground';
export const ENCRE_D_ICONE_ACTIVE = 'text-primary';

/**
 * TCK-2490 — un compteur : des chiffres, pas une pastille pleine. TCK-2691 (C8) — `text-xs` 600. `primary-deep` et non `primary` :
 * mesuré sur les jetons, `primary` tombe à 4,10:1 (clair) et 3,74:1 (sombre) sur le voile de l'entrée
 * active, sous les 4,5:1 d'un texte ; `primary-deep` tient 6,19:1 et 4,77:1 (`AppSidebar.contraste`).
 */
export const STYLE_COMPTEUR = 'ml-auto shrink-0 text-xs font-semibold tabular-nums text-primary-deep';

/**
 * TCK-2480 — l'épingle d'une ligne : discrète, visible au survol de la ligne ET au focus clavier,
 * toujours visible quand la ligne est épinglée (on reconnaît « Épinglés ») ; à 60 % sur un écran
 * tactile, qui n'a pas de survol (A13).
 *
 * Revue adverse de TCK-2490 (M2) — elle ne RÉSERVE sa place que là où elle s'affiche : au repos, largeur
 * nulle (elle reste focalisable : ni `hidden` ni `invisible`) ; au survol de la ligne, au focus, épinglée
 * ou au doigt, sa largeur (`--l-epingle` : 28 px, 36 px sous `md`) et sa marge. Invisible, elle gardait
 * 32 px : les compteurs du menu s'arrêtaient 29 px avant les puces d'« Aujourd'hui » et les touches.
 */
export const STYLE_EPINGLE =
  'inline-flex h-7 w-0 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground opacity-0 [--l-epingle:calc(var(--spacing)*7)] transition-[opacity,width,margin] hover:bg-foreground/5 hover:text-foreground focus:mr-1 focus:w-(--l-epingle) focus-visible:opacity-100 group-hover/ligne:mr-1 group-hover/ligne:w-(--l-epingle) group-hover/ligne:opacity-100 aria-pressed:mr-1 aria-pressed:w-(--l-epingle) aria-pressed:opacity-100 aria-disabled:cursor-not-allowed tactile:mr-1 tactile:w-(--l-epingle) tactile:not-aria-pressed:opacity-60 max-md:h-9 max-md:[--l-epingle:calc(var(--spacing)*9)] motion-reduce:transition-none icones:hidden';

/** TCK-2480 — le libellé d'une ligne : lu par le lecteur d'écran dans tous les modes, caché à l'œil réduite. */
export const LIBELLE_DE_LIGNE = 'truncate icones:sr-only';

/**
 * TCK-2490 — le repli animé d'une liste (groupe, « Plus ») : la hauteur passe par `grid-template-rows`
 * (0fr ↔ 1fr), 300 ms sur une sortie exponentielle ; rien sous `prefers-reduced-motion`.
 */
export const STYLE_REPLI =
  'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none';
