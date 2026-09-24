/**
 * TCK-567, restes de la vérification adverse — ce qui rend une illustration INVISIBLE sans la
 * retirer du DOM.
 *
 * Les gardes vérifiaient qu'un `svg` était PRÉSENT dans la boîte, jamais qu'on pouvait le voir.
 * Rejoué avant d'écrire ceci, `src/components/welcome` et `src/components/privacy` restaient
 * verts (50/50) sous trois mutations :
 *
 * - l'icône masquée (classe `hidden` ajoutée à l'icône de `WelcomeIllustration`) ;
 * - l'icône peinte de la couleur de sa pastille (la même couleur en texte et en fond) ;
 * - une opacité PARTIELLE sur la boîte au téléphone (`max-sm:` suivi d'une opacité de 5 %) : la
 *   liste des classes masquantes ne connaissait que l'opacité nulle.
 *
 * jsdom ne calcule ni couleur ni opacité : ces fonctions lisent les CLASSES qui les commandent,
 * comme le reste de `WelcomeModal.test.tsx`. ⚠ Ce sont des listes fermées — une manière de
 * masquer qu'elles ne nomment pas passerait (un `clip-path` utilitaire, une translation hors
 * cadre). Ce reste est écrit dans TCK-567.
 *
 * Seconde vérification adverse (2026-09-24), trois contournements rejoués verts (24/24) :
 *
 * - l'encre de l'icône à 5 % d'opacité (`/5` sur la couleur de texte) : la garde lisait le NOM du
 *   jeton et jetait l'alpha ;
 * - l'encre `background` sur la pastille `card` : deux noms différents, deux couleurs presque
 *   identiques (1,05:1) — comparer des noms ne dit rien de ce qu'on voit ;
 * - une opacité en VALEUR ARBITRAIRE sur la boîte (`opacity-` suivi de `[.05]`) : la liste ne
 *   connaissait que l'échelle numérique et la forme `[opacity:…]`.
 *
 * D'où la mesure, désormais : le RAPPORT DE CONTRASTE WCAG entre le trait (couleur de texte
 * héritée, alpha COMPOSÉ sur le fond) et le fond réel remonté du DOM, dans les deux thèmes, par le
 * harnais partagé `src/test/contraste-wcag.ts`, contre le seuil non textuel de 3:1 (WCAG 1.4.11).
 * Toute variante d'encre ou de fond (`max-sm:`, `dark:`…) est mesurée aussi, et une valeur qu'on
 * ne sait pas résoudre (couleur arbitraire, variable CSS) est un échec nommé, pas un vert.
 *
 * Troisième vérification adverse (reprise du 2026-09-24), cinq classes posées sur l'icône de
 * `WelcomeIllustration` et rejouées vertes (24/24) — toutes les cinq rendent le trait invisible
 * ou illisible sans toucher ni au DOM ni aux jetons :
 *
 * - `[color:transparent]` — une PROPRIÉTÉ arbitraire : la garde ne connaissait que les propriétés
 *   d'affichage, pas la couleur que le trait hérite (`currentColor`) ;
 * - `stroke-[0]` et `[stroke-width:0]` — l'épaisseur nulle écrite en valeur arbitraire : seule
 *   l'échelle (`stroke-0`) et l'attribut SVG étaient lus, et la classe l'emporte sur l'attribut ;
 * - `brightness-0` — un FILTRE : il repeint le trait en noir, que le contraste mesuré ignore
 *   (noir sur la pastille `card` du thème sombre) ;
 * - `blur-lg` — un filtre encore : 16 px de flou sur un trait de 2 px, il n'en reste qu'une ombre.
 *
 * D'où trois règles de plus, dans `raisonsDInvisibilite` :
 *
 * 1. toute propriété arbitraire (`[propriété:valeur]`) entre l'icône et la boîte est refusée,
 *    quelle qu'elle soit — la mesure ne sait pas ce qu'elle fait, et une icône décorative n'a
 *    aucune raison d'en porter une ;
 * 2. tout filtre et tout mélange (`blur`, `brightness`, `contrast`, `grayscale`, `invert`, `sepia`,
 *    `saturate`, `hue-rotate`, `drop-shadow`, `filter-…`, `mix-blend-…`, `mask-…`) est refusé,
 *    sauf sa valeur neutre (`blur-none`, `brightness-100`, `grayscale-0`, `mix-blend-normal`…) :
 *    un filtre change ce qu'on voit après le calcul de contraste ;
 * 3. l'épaisseur du trait est jugée sur la classe comme sur l'attribut, contre un plancher de
 *    0,5 unité (0,75 px à `size-9`) et non plus contre zéro : `stroke-[0.05]` n'est pas un trait.
 *
 * Et `classesMasquantes` (qui garde aussi les ancêtres de la boîte) reconnaît les formes nulles
 * écrites en valeur arbitraire (`h-[0]`, `size-[0px]`, `scale-[0]`, `stroke-[0]`) et les propriétés
 * arbitraires de couleur, de trait, de filtre, de masque et de transformation.
 *
 * Quatrième vérification adverse (reprise du 2026-09-24), dix classes sur l'icône, vertes (24/24) :
 *
 * - `bg-primary` — le fond PROPRE de l'icône n'était pas mesuré (`fondHerite` part du parent),
 *   alors que `max-sm:bg-primary` rougissait : trait `primary` sur fond `primary`, 1:1 ;
 * - `size-px`, `size-0.5`, `size-[0.1px]`, `scale-5`, `-scale-x-0`, `rotate-x-90` — des
 *   RÉDUCTIONS : la liste ne connaissait que les formes nulles. `reductionDe` pose des seuils
 *   (16 px, un quart, 50 %, cosinus ½, inclinaison de 60°) ;
 * - `stroke-[0.02rem]` — l'épaisseur en `rem` n'était pas lue (0,32 unité, sous le plancher).
 *
 * (`bg-card` sur l'icône, rejouée avec elles, reste verte À BON DROIT : c'est le fond de la
 * pastille, le trait `primary` s'y lit comme sans elle.)
 *
 * ⚠ CE QUI RESTE HORS D'ATTEINTE, écrit aussi dans TCK-567 : ces fonctions lisent des CLASSES.
 * Elles ne voient ni un `style` en ligne (elles le signalent sur la chaîne, sans le lire), ni une
 * règle CSS écrite ailleurs qui viserait l'icône, ni un frère posé PAR-DESSUS elle (un halo en
 * `z-10` opaque), ni une translation hors cadre (`translate-x-full` dans une boîte
 * `overflow-hidden`), ni une EXPRESSION de dimension (`h-[clamp(…)]`, `w-[calc(…)]`, qu'elles
 * n'évaluent pas — la boîte en porte une), ni une rotation 3D ou une inclinaison COMPOSÉES sur
 * plusieurs éléments (chaque classe est jugée seule : deux `rotate-x-55` empilés, chacun
 * au-dessus du seuil, écrasent l'icône au tiers de sa hauteur). Le dernier juge reste la mesure
 * au navigateur, sur la CSS compilée.
 */

import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_NON_TEXTUEL,
  composer,
  contraste,
  fmt,
  fondHerite,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
} from '@/test/contraste-wcag';

/** Une classe qui retire, écrase ou délave un élément, sous n'importe quelle variante. */
const MASQUANTE =
  /(^|:)(hidden|invisible|collapse|sr-only|opacity-(?!100$)\d+|h-0|max-h-0|w-0|max-w-0|size-0|scale-0|scale-[xy]-0|text-transparent|stroke-0|stroke-transparent)$/;
/**
 * Les mêmes, écrites en valeur arbitraire : la propriété entière (`[opacity:…]`, `[clip-path:…]`…)
 * ou la valeur seule d'une opacité (`opacity-[…]`, `opacity-(--x)`). Une opacité arbitraire est
 * refusée quelle que soit sa valeur : `[1]` se lit, mais une variable ne se résout pas ici, et une
 * boîte décorative n'a aucune raison d'en porter une.
 */
const MASQUANTE_ARBITRAIRE =
  /(^|:)(\[(display|visibility|opacity|content-visibility|clip-path|clip|color|stroke|stroke-width|stroke-opacity|fill|filter|mask|mask-image|transform|scale|translate|width|height):|opacity-[[(])/;
/**
 * Une dimension, une échelle ou une épaisseur NULLE écrite en valeur arbitraire : `h-[0]`,
 * `size-[0px]`, `scale-[0%]`, `stroke-[0]`, `stroke-[0.0rem]` (reprise du 2026-09-24 :
 * `stroke-[0]` sur l'icône restait vert).
 */
const NULLE_ARBITRAIRE = /(^|:)(h|w|size|max-h|max-w|scale|scale-x|scale-y|stroke)-\[0*\.?0*(px|rem|em|%)?\]$/;

/**
 * Un filtre ou un mélange hors de sa valeur neutre. Il change ce qu'on voit APRÈS la couleur :
 * `brightness-0` repeint en noir, `blur-lg` efface un trait fin — la mesure de contraste ne voit
 * ni l'un ni l'autre.
 */
const FILTRE = /^(blur|brightness|contrast|grayscale|invert|sepia|saturate|hue-rotate|drop-shadow|filter|mix-blend|bg-blend|mask)(-|$)/;
const FILTRE_NEUTRE =
  /^(blur-none|brightness-100|contrast-100|grayscale-0|invert-0|sepia-0|saturate-100|hue-rotate-0|drop-shadow-none|filter-none|mix-blend-normal|bg-blend-normal|mask-none)$/;

/** Une propriété arbitraire entière : `[color:transparent]`, `[stroke-width:0]`, `[filter:…]`. */
const PROPRIETE_ARBITRAIRE = /^\[[a-z-]+:/;

/**
 * Le plancher de l'épaisseur du trait, en unités du `viewBox` 24 de Lucide (0,75 px à `size-9`).
 * L'icône en porte 1,5 ; au-dessous d'une demi-unité, le trait n'est plus qu'un fil.
 */
const EPAISSEUR_MINIMALE = 0.5;

/**
 * L'utilitaire d'une classe, sans ses variantes : `max-sm:blur-lg` → `blur-lg`,
 * `[@media(max-height:30rem)]:hidden` → `hidden`. Les `:` entre crochets ou parenthèses
 * appartiennent à la variante ou à la valeur, pas au découpage.
 */
export function utilitaireDe(classe: string): string {
  let profondeur = 0;
  let debut = 0;
  for (let i = 0; i < classe.length; i += 1) {
    const c = classe[i];
    if (c === '[' || c === '(') profondeur += 1;
    else if (c === ']' || c === ')') profondeur -= 1;
    else if (c === ':' && profondeur === 0) debut = i + 1;
  }
  return classe.slice(debut);
}

/** Pixels CSS par unité de longueur arbitraire (`rem`/`em` sur la racine de 16 px). */
const PX_PAR_UNITE: Readonly<Record<string, number>> = { '': 1, px: 1, rem: 16, em: 16 };

/**
 * L'épaisseur que la classe impose au trait, en unités du `viewBox` (`stroke-2`, `stroke-[0.2]`,
 * `stroke-[0.02rem]` → 0,32), ou `null` si aucune. Une longueur CSS sur un SVG se compte en
 * unités utilisateur ; `rem`/`em` valent 16, et `%` se rapporte à la diagonale normalisée du
 * `viewBox` 24 × 24 de Lucide (24). Reprise du 2026-09-24 : `stroke-[0.02rem]` restait vert, la
 * lecture ne connaissait que le nombre nu et `px`.
 */
function epaisseurDeClasse(classe: string): number | null {
  const m = /^stroke-(?:(\d+(?:\.\d+)?)|\[(\d*\.?\d+)(px|rem|em|%)?\])$/.exec(utilitaireDe(classe));
  if (!m) {
    // Une longueur d'une AUTRE unité (`stroke-[0.1mm]`, que Tailwind 4 émet en `stroke-width`) :
    // illisible ici, donc NaN — jugée trop fine plutôt que supposée épaisse (troisième passe).
    return /^stroke-\[\d*\.?\d+[a-z]+\]$/i.test(utilitaireDe(classe)) ? Number.NaN : null;
  }
  if (m[1] !== undefined) return Number(m[1]);
  const valeur = Number(m[2]);
  return m[3] === '%' ? (valeur * 24) / 100 : valeur * PX_PAR_UNITE[m[3] ?? ''];
}

/**
 * Plus petite dimension qu'on accepte sur la chaîne de l'icône : 16 px (`size-4`). L'icône en
 * mesure 36 (`size-9`), sa pastille 80 ; au-dessous d'un rem, ce n'est plus une illustration.
 */
const DIMENSION_MINIMALE_PX = 16;
/** Plus petite part d'une dimension relative (`w-1/12`, `h-[10%]`) : un quart. */
const PART_MINIMALE = 0.25;
/** Plus petit facteur d'échelle accepté (`scale-50`). */
const ECHELLE_MINIMALE = 0.5;

/**
 * Pourquoi une classe RÉDUIT l'élément au point de l'effacer, ou `null`. Reprise du 2026-09-24 :
 * `classesMasquantes` ne connaissait que les formes NULLES, et sept réductions posées sur l'icône
 * restaient vertes — `size-px`, `size-0.5`, `size-[0.1px]` (1 à 2 px), `scale-5` et
 * `-scale-x-0` (5 % et 0), `rotate-x-90` (l'icône vue par la tranche). D'où des SEUILS :
 *
 * - dimension (`size`, `w`, `h`, `max-w`, `max-h`) sous 16 px, ou sous un quart en relatif ;
 * - échelle (`scale`, `scale-x`, `scale-y`, signe compris : un miroir n'efface rien) sous 50 % ;
 * - rotation 3D (`rotate-x`, `rotate-y`) dont le cosinus tombe sous ½ — entre 60° et 120° modulo
 *   180°, l'icône est écrasée à moins de la moitié de sa hauteur ;
 * - inclinaison (`skew-x`, `skew-y`) de 60° ou plus.
 *
 * Une valeur arbitraire qu'on ne sait pas lire (`scale-[var(--x)]`, `rotate-x-[1turn]`, et depuis
 * la troisième passe une longueur d'une autre unité : `size-[1mm]`) est rendue comme non mesurable. ⚠ Une EXPRESSION de dimension (`h-[clamp(…)]`, `w-[calc(…)]`) n'est pas
 * évaluée — la boîte elle-même en porte une —, et c'est un reste écrit dans TCK-567.
 */
export function reductionDe(classe: string): string | null {
  const u = utilitaireDe(classe);

  const dim = /^(size|w|h|max-w|max-h)-(.+)$/.exec(u);
  if (dim) {
    const v = dim[2];
    if (v === 'px') return `${classe} (1 px)`;
    if (/^\d+(\.\d+)?$/.test(v)) return Number(v) * 4 < DIMENSION_MINIMALE_PX ? `${classe} (${Number(v) * 4} px)` : null;
    const frac = /^(\d+)\/(\d+)$/.exec(v);
    if (frac) return Number(frac[1]) / Number(frac[2]) < PART_MINIMALE ? `${classe} (${frac[0]})` : null;
    const arb = /^\[(\d*\.?\d+)(px|rem|em|%)?\]$/.exec(v);
    if (arb) {
      const n = Number(arb[1]);
      if (arb[2] === '%') return n / 100 < PART_MINIMALE ? `${classe} (${n} %)` : null;
      const px = n * PX_PAR_UNITE[arb[2] ?? ''];
      return px < DIMENSION_MINIMALE_PX ? `${classe} (${px} px)` : null;
    }
    // Une longueur d'une autre unité (`size-[1mm]`, 3,8 px) : non mesurable, jamais supposée grande.
    if (/^\[\d*\.?\d+[a-z]+\]$/i.test(v)) return `${classe} (unité non mesurable)`;
    return null;
  }

  const ech = /^-?scale-(?:[xy]-)?(.+)$/.exec(u);
  if (ech && ech[1] !== '3d' && ech[1] !== 'none') {
    const v = ech[1];
    let facteur: number | null = null;
    if (/^\d+$/.test(v)) facteur = Number(v) / 100;
    const arb = /^\[(\d*\.?\d+)(%)?\]$/.exec(v);
    if (arb) facteur = arb[2] ? Number(arb[1]) / 100 : Number(arb[1]);
    if (facteur === null) return `${classe} (échelle non mesurable)`;
    return facteur < ECHELLE_MINIMALE ? `${classe} (échelle ${Math.round(facteur * 100)} %)` : null;
  }

  const rot = /^-?rotate-[xy]-(.+)$/.exec(u);
  if (rot) {
    const deg = /^(\d+)$/.exec(rot[1]) ?? /^\[(\d*\.?\d+)deg\]$/.exec(rot[1]);
    if (!deg) return `${classe} (rotation non mesurable)`;
    return Math.abs(Math.cos((Number(deg[1]) * Math.PI) / 180)) < 0.5 ? `${classe} (vue par la tranche)` : null;
  }

  const skew = /^-?skew-[xy]-(.+)$/.exec(u);
  if (skew) {
    if (!/^\d+$/.test(skew[1])) return `${classe} (inclinaison non mesurable)`;
    return Number(skew[1]) % 180 >= 60 && Number(skew[1]) % 180 <= 120 ? `${classe} (inclinaison)` : null;
  }

  return null;
}

export function classesDe(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

/** Les classes masquantes que porte un élément. */
export function classesMasquantes(el: Element): string[] {
  return classesDe(el).filter((c) => MASQUANTE.test(c) || MASQUANTE_ARBITRAIRE.test(c) || NULLE_ARBITRAIRE.test(c));
}

/**
 * Ce que la mesure ne sait pas modéliser sur la chaîne de l'icône : une propriété arbitraire, un
 * filtre, un mélange, un masque (hors valeur neutre), un `style` en ligne.
 */
function effetsNonMesures(el: Element): string[] {
  const effets = classesDe(el).filter((c) => {
    const u = utilitaireDe(c);
    return PROPRIETE_ARBITRAIRE.test(u) || (FILTRE.test(u) && !FILTRE_NEUTRE.test(u));
  });
  if (el.hasAttribute('style')) effets.push(`style="${el.getAttribute('style')}"`);
  return effets;
}

/**
 * Une couleur de texte ou de fond écrite en valeur arbitraire ou en variable : non mesurable ici.
 * Toute valeur arbitraire qui ne commence pas par un chiffre (une taille : `text-[13px]`) en est
 * une — `text-[transparent]` et `text-[currentcolor]` comprises, qu'aucun jeton ne résout.
 */
const COULEUR_NON_RESOLUE = /(^|:)(text|bg)-(\[(?![\d.])|\()/;
/** Une couleur de TRAIT posée par classe : elle écrase `stroke="currentColor"` de Lucide. */
const TRAIT_RECOLORE = /(^|:)stroke-(?!\d+$|\[\d)(?!current$)[a-z[(]/;

type Utilitaire = NonNullable<ReturnType<typeof litUtilitaireDeCouleur>>;

function utilitaires(el: Element, prefixe: 'text' | 'bg'): Utilitaire[] {
  return classesDe(el)
    .map((c) => litUtilitaireDeCouleur(c, prefixe))
    .filter((u): u is Utilitaire => u !== null && (prefixe !== 'bg' || u.jeton !== 'transparent'));
}

const nom = (u: Utilitaire, prefixe: string) =>
  `${u.variante ? `${u.variante}:` : ''}${prefixe}-${u.jeton}${u.alpha === 1 ? '' : `/${Math.round(u.alpha * 100)}`}`;

/**
 * Les encres que le trait peut prendre : en remontant de l'icône à la boîte, chaque couleur de
 * texte rencontrée, variantes comprises, jusqu'au premier élément qui en pose une SANS variante
 * (au-dessus, elle est écrasée). Une variante plus haut n'agit que si rien ne l'écrase dessous —
 * on la mesure quand même : trop mesurer coûte un faux rouge nommé, trop peu un vert qui ment.
 */
function encresPossibles(svg: Element, boite: Element): Utilitaire[] {
  const encres: Utilitaire[] = [];
  for (let el: Element | null = svg; el; el = el.parentElement) {
    const propres = utilitaires(el, 'text');
    encres.push(...propres);
    if (propres.some((u) => u.variante === '') || el === boite) break;
  }
  return encres;
}

/**
 * Les fonds sous le trait : au repos, le fond que l'icône PEINT ELLE-MÊME s'il y en a un, sinon
 * celui dont elle hérite ; plus chaque variante de fond, de l'icône à la boîte.
 *
 * Reprise du 2026-09-24 : `fondHerite` commence au PARENT. `bg-primary` posé sur l'icône (trait
 * `primary` sur fond `primary`, 1:1) restait vert (24/24) quand `max-sm:bg-primary` rougissait —
 * le fond propre du `svg` n'était mesuré que sous variante.
 */
function fondsSousLIcone(svg: Element, boite: Element, jetons: Readonly<Record<string, string>>) {
  const herite = fondHerite(svg, jetons);
  const propre = utilitaires(svg, 'bg').find((u) => u.variante === '');
  const fonds = [
    propre
      ? {
          etat: 'repos',
          hex: versHex(composer(versRvb(resoudreCouleur(propre.jeton, jetons)), versRvb(herite.hex), propre.alpha)),
          provenance: `${nom(propre, 'bg')} (sur l’icône) sur ${herite.hex}`,
        }
      : { etat: 'repos', ...herite },
  ];
  for (let el: Element | null = svg; el; el = el.parentElement) {
    for (const u of utilitaires(el, 'bg').filter((v) => v.variante !== '')) {
      const dessous = fondHerite(el, jetons);
      fonds.push({
        etat: u.variante,
        hex: versHex(composer(versRvb(resoudreCouleur(u.jeton, jetons)), versRvb(dessous.hex), u.alpha)),
        provenance: `${nom(u, 'bg')} sur ${dessous.hex}`,
      });
    }
    if (el === boite) break;
  }
  return fonds;
}

const THEMES = [
  ['clair', JETONS_CLAIR],
  ['sombre', JETONS_SOMBRE],
] as const;

/**
 * Pourquoi l'icône de la boîte ne se VERRAIT pas — une liste vide si elle se voit.
 *
 * Regarde l'icône et ses ancêtres jusqu'à la boîte (la classe masquante `permise` de la boîte, son
 * effacement sur écran bas, exceptée), son trait, et le contraste entre la couleur de son trait
 * (`currentColor`, donc la couleur de texte héritée) et le fond peint le plus proche — celui de
 * l'icône elle-même compris —, et les réductions qui l'effacent sans la retirer (`reductionDe`).
 */
export function raisonsDInvisibilite(boite: Element, permise: string[] = []): string[] {
  const svg = boite.querySelector('svg');
  if (!svg) return ['aucune icône'];
  const raisons: string[] = [];

  for (let el: Element | null = svg; el; el = el.parentElement) {
    const masquantes = classesMasquantes(el).filter((c) => !(el === boite && permise.includes(c)));
    if (masquantes.length > 0) raisons.push(`${el.tagName.toLowerCase()} : ${masquantes.join(' ')}`);
    if (el === boite) break;
  }

  if (svg.getAttribute('stroke') !== 'currentColor') raisons.push(`trait : ${svg.getAttribute('stroke')}`);
  const epaisseur = Number(svg.getAttribute('stroke-width') ?? '0');
  if (!(epaisseur >= EPAISSEUR_MINIMALE)) raisons.push(`épaisseur du trait : ${svg.getAttribute('stroke-width')}`);

  for (let el: Element | null = svg; el; el = el.parentElement) {
    const nonMesurables = classesDe(el).filter((c) => COULEUR_NON_RESOLUE.test(c) || TRAIT_RECOLORE.test(c));
    if (nonMesurables.length > 0) raisons.push(`couleur non mesurable : ${nonMesurables.join(' ')}`);
    const effets = effetsNonMesures(el);
    if (effets.length > 0) raisons.push(`${el.tagName.toLowerCase()} — effet non mesurable : ${effets.join(' ')}`);
    // La classe l'emporte sur l'attribut `stroke-width` du SVG, et se transmet par héritage.
    const tropFines = classesDe(el).filter((c) => {
      const e = epaisseurDeClasse(c);
      return e !== null && !(e >= EPAISSEUR_MINIMALE);
    });
    if (tropFines.length > 0) raisons.push(`épaisseur du trait : ${tropFines.join(' ')}`);
    const reductions = classesDe(el)
      .map(reductionDe)
      .filter((r): r is string => r !== null);
    if (reductions.length > 0) raisons.push(`${el.tagName.toLowerCase()} — réduite : ${reductions.join(' ')}`);
    // Un rembourrage ou un filet sur le SVG lui-même rétrécit le DESSIN dans sa boîte (`p-4` sur
    // une icône de 36 px : 4 px de dessin, 24/24 verts avant la troisième passe).
    if (el === svg) {
      const retrecissantes = classesDe(el).filter((c) => /^-?(p[xytrblse]?|border(-[xytrblse])?)(-|$)/.test(utilitaireDe(c))
        && !/^border-(solid|dashed|dotted|double|none|hidden|transparent|current|inherit)$/.test(utilitaireDe(c))
        && !/^border(-[xytrblse])?-(?!\d|\[|px)/.test(utilitaireDe(c)));
      if (retrecissantes.length > 0) raisons.push(`svg — dessin rétréci : ${retrecissantes.join(' ')}`);
    }
    if (el === boite) break;
  }

  const encres = encresPossibles(svg, boite);
  if (encres.length === 0) raisons.push('aucune couleur de trait posée entre l’icône et la boîte');

  for (const [theme, jetons] of THEMES) {
    let fonds: ReturnType<typeof fondsSousLIcone>;
    try {
      fonds = fondsSousLIcone(svg, boite, jetons);
    } catch (e) {
      raisons.push(`${theme} — fond non mesurable : ${(e as Error).message}`);
      continue;
    }
    for (const fond of fonds) {
      for (const encre of encres) {
        let hex: string;
        try {
          hex = versHex(composer(versRvb(resoudreCouleur(encre.jeton, jetons)), versRvb(fond.hex), encre.alpha));
        } catch (e) {
          raisons.push(`${theme} : ${(e as Error).message}`);
          continue;
        }
        const ratio = contraste(hex, fond.hex);
        if (ratio < SEUIL_NON_TEXTUEL) {
          raisons.push(`${theme} : ${nom(encre, 'text')} sur ${fond.provenance} (${fond.etat}) — ${fmt(ratio)}`);
        }
      }
    }
  }

  return raisons;
}
