/**
 * La GÉOMÉTRIE VERTICALE qu'un navigateur donnerait à un sous-arbre rendu par jsdom — hauteurs,
 * décalages, affichage à une largeur, cible tactile — calculée à partir des classes COMPILÉES par
 * le Tailwind du dépôt (TCK-577, reprise des défauts mineurs du 2026-09-24).
 *
 * Pourquoi ce module : les gardes de hauteur du comparateur mobile lisaient UNE classe par
 * propriété (« la classe `h-…` du cadre », « la classe `py-…` du lien »). Mesuré le 2026-09-24 :
 * `relative h-14 min-h-64 overflow-hidden` sur le cadre de la vignette laissait 9/9 verts (la
 * vignette fait alors 256 px), `mt-8` au lieu de `mt-3` dans l'attente mobile (le premier critère
 * saute de 20 px à l'arrivée) et `grid gap-4` au lieu de `hidden gap-4 md:grid` (le squelette de
 * bureau s'affiche sous le squelette mobile) laissaient 2/2 verts.
 *
 * Ici, TOUTES les classes d'un élément sont compilées, et TOUTES leurs déclarations sont lues :
 *
 * - une propriété qui agit sur la hauteur est MODÉLISÉE (hauteur, min/max, rembourrage, filet,
 *   marge, lignes bornées, empilement bloc / flex / grille d'une rangée) ;
 * - une propriété connue pour ne pas agir sur la hauteur est ignorée (`NEUTRES`) ;
 * - toute AUTRE propriété, tout contexte CSS inconnu, toute longueur illisible, un
 *   `aspect-ratio`, ou un texte libre dont le nombre de lignes n'est pas borné LÈVENT. Le test
 *   rougit alors sur ce qu'il ne sait pas mesurer, au lieu de le supposer sans effet.
 *
 * Les variantes d'état (`hover:`, `focus-visible:`, `dark:`…) comptent au PIRE : un `hover:py-8`
 * agrandit la boîte au survol, la garde le compte. Les variantes de largeur (`md:`, `max-md:`…)
 * s'appliquent selon la largeur demandée.
 *
 * Seconde reprise (vérification adverse du 2026-09-24) — trois voies passaient À CÔTÉ des classes
 * lues, et elles lèvent ou comptent désormais :
 *
 * - un PSEUDO-ÉLÉMENT (`before:block before:h-64`) était sauté sans lever : la vignette faisait
 *   312 px au navigateur, 13/13 verts. Un `::before`/`::after` n'est admis que HORS DU FLUX
 *   (`absolute`/`fixed` sous toutes ses variantes) ou non affiché ; tout autre LÈVE ;
 * - un attribut `style` (`style={{ minHeight: 256 }}`) n'était pas lu : toute propriété en ligne
 *   autre que `grid-template-columns` LÈVE ;
 * - l'affichage ne lisait que l'élément lui-même : un ANCÊTRE `hidden` laissait « affiché » et
 *   mesurable un bloc que personne ne voit. `affichage()` et `decalage()` lisent la chaîne entière.
 *
 * Troisième passe (la session, 2026-09-24) — la seconde vérification a encore trouvé cinq voies, et
 * elles rougissent désormais (2 rouges chacune sur 53, mutations rejouées) : une hauteur sur une
 * boîte EN LIGNE (`inline h-14` : la vignette tombait à 0 px au navigateur) et un enfant en ligne
 * dans un flux de blocs (`inline-block w-full` : +7 px de boîte de ligne) LÈVENT ; l'attribut HTML
 * `hidden` vaut `display: none` ; un `::after` à `content: none` ou à `z-index` négatif ne compte
 * plus dans la cible tactile.
 *
 * Ce qu'il ne modélise pas, délibérément : l'effondrement des marges (compté en somme : surestime,
 * jamais ne sous-estime), le retour à la ligne d'un texte libre (il lève), une grille de plus d'une
 * rangée (elle lève), la feuille de style GLOBALE (`globals.css` hors `@theme`, Preflight) — seules
 * les classes utilitaires et le `style` en ligne des éléments sont lus —, un élément qui en
 * recouvrirait un autre (un calque `absolute` posé par-dessus, l'ordre de peinture entre frères)
 * pour la cible tactile, une transformation
 * (`scale-*`) dans la HAUTEUR — sans effet sur le flux, elle y est admise alors qu'elle agrandit
 * le dessin (la cible tactile, elle, lève dessus).
 */
import fs from 'node:fs';
import path from 'node:path';

import { cssCompile, jetonsDe } from '@/test/__tests__/couleur-compilee';

/** Les jetons de Tailwind (`--spacing`, `--text-xs`…), pour convertir une déclaration en px. */
const THEME = jetonsDe(
  fs.readFileSync(path.join(process.cwd(), 'node_modules/tailwindcss/theme.css'), 'utf8'),
);

/** Une longueur compilée, en px (1 rem = 16 px). LÈVE sur toute forme inconnue. */
export function enPx(valeur: string): number {
  const v = valeur.trim();
  let m: RegExpMatchArray | null;
  if (v === '0') return 0;
  if ((m = v.match(/^(-?[\d.]+)px$/))) return Number(m[1]);
  if ((m = v.match(/^(-?[\d.]+)rem$/))) return Number(m[1]) * 16;
  if ((m = v.match(/^calc\(var\(--spacing\) \* (-?[\d.]+)\)$/))) return enPx(THEME['--spacing']) * Number(m[1]);
  if ((m = v.match(/^var\((--[\w-]+)\)$/)) && THEME[m[1]]) return enPx(THEME[m[1]]);
  throw new Error(`longueur illisible : ${v}`);
}

interface Declaration {
  readonly propriete: string;
  readonly valeur: string;
  readonly pseudo: 'after' | 'before' | null;
  readonly largeurMin: number;
  readonly largeurMax: number;
  /** Sous une variante d'état (survol, focus, thème sombre…) : comptée au pire. */
  readonly etat: boolean;
  /** Posée sur les ENFANTS (`space-y-*`, `divide-*`) et non sur l'élément. */
  readonly enfants: boolean;
}

/** Le corps du bloc qui s'ouvre à `entete`, accolades équilibrées ; '' s'il n'existe pas. */
function corpsDe(css: string, entete: string): string {
  const debut = css.indexOf(entete);
  if (debut < 0) return '';
  const ouvre = css.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouvre; i < css.length; i++) {
    if (css[i] === '{') profondeur++;
    else if (css[i] === '}' && --profondeur === 0) return css.slice(ouvre + 1, i);
  }
  throw new Error(`bloc « ${entete} » non refermé`);
}

function contexte(entetes: readonly string[]): Omit<Declaration, 'propriete' | 'valeur'> {
  let pseudo: Declaration['pseudo'] = null;
  let largeurMin = 0;
  let largeurMax = Infinity;
  let etat = false;
  let enfants = false;
  for (const e of entetes) {
    let m: RegExpMatchArray | null;
    if (e === '&::after') pseudo = 'after';
    else if (e === '&::before') pseudo = 'before';
    else if ((m = e.match(/^@media \(width >= ([\d.]+)rem\)$/))) largeurMin = Math.max(largeurMin, Number(m[1]) * 16);
    else if ((m = e.match(/^@media \(width < ([\d.]+)rem\)$/))) largeurMax = Math.min(largeurMax, Number(m[1]) * 16);
    else if (
      e === '@media (hover: hover)' ||
      /^&:(hover|focus|focus-visible|focus-within|active|disabled)$/.test(e) ||
      /\.dark\b/.test(e)
    )
      etat = true;
    else if (e.startsWith('@supports')) continue; // repli de `color-mix` : s'applique.
    else if (e === ':where(& > :not(:last-child))') enfants = true; // `space-y-*`
    else throw new Error(`contexte CSS non modélisé : « ${e} »`);
  }
  return { pseudo, largeurMin, largeurMax, etat, enfants };
}

/**
 * Le `style` en ligne n'est admis que pour `grid-template-columns` (la grille d'une colonne par
 * bien, lue par `verifierUneRangee`). Toute autre propriété LÈVE : elle agirait sur la boîte sans
 * passer par les classes que ce module lit (`style={{ minHeight: 256 }}` : 13/13 verts avant).
 */
const STYLE_ADMIS = new Set(['grid-template-columns']);
function verifierStyleEnLigne(el: Element) {
  const style = (el as HTMLElement).style;
  if (!style) return;
  for (let i = 0; i < style.length; i++) {
    if (!STYLE_ADMIS.has(style[i])) {
      throw new Error(`style en ligne non modélisé : ${style[i]}: ${style.getPropertyValue(style[i])} (« ${el.getAttribute('class') ?? el.tagName} »)`);
    }
  }
}

/** Toutes les déclarations compilées des classes d'un élément, dans l'ordre d'émission. */
async function toutesLesDeclarations(el: Element): Promise<Declaration[]> {
  verifierStyleEnLigne(el);
  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  if (!classes.length) return [];
  const corps = corpsDe(await cssCompile(classes), '@layer utilities');
  const out: Declaration[] = [];
  const pile: string[] = [];
  let tampon = '';
  const poser = () => {
    const t = tampon.trim();
    tampon = '';
    if (!t) return;
    const i = t.indexOf(':');
    if (i < 0) throw new Error(`déclaration illisible : ${t}`);
    // pile[0] est le sélecteur de la classe ; le reste, ses variantes imbriquées.
    out.push({ propriete: t.slice(0, i).trim(), valeur: t.slice(i + 1).trim(), ...contexte(pile.slice(1)) });
  };
  for (const c of corps) {
    if (c === '{') {
      pile.push(tampon.trim());
      tampon = '';
    } else if (c === '}') {
      poser();
      pile.pop();
    } else if (c === ';') poser();
    else tampon += c;
  }
  return out;
}

async function declarationsA(el: Element, largeur: number): Promise<Declaration[]> {
  return (await toutesLesDeclarations(el)).filter((d) => d.largeurMin <= largeur && largeur < d.largeurMax);
}

/** Sans effet sur la HAUTEUR de la boîte dans ce modèle. Tout ce qui n'est pas ici ni modélisé LÈVE. */
const NEUTRES = new Set([
  'overflow', 'overflow-x', 'overflow-y', 'text-overflow', '-webkit-box-orient',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius',
  'border-bottom-right-radius', 'border-start-start-radius', 'border-start-end-radius',
  'border-end-start-radius', 'border-end-end-radius',
  'background-color', 'background-image', 'color', 'fill', 'stroke', 'stroke-width',
  'grid-template-columns', 'place-items', 'align-items', 'justify-items', 'justify-content',
  'align-content', 'place-content', 'justify-self', 'align-self', 'column-gap',
  'z-index', 'width', 'min-width', 'max-width', 'inline-size',
  // Décalages d'un élément positionné : aucun effet sur le flux (`sticky`, `relative`, `absolute`).
  'top', 'right', 'bottom', 'left', 'inset', 'inset-inline', 'inset-block',
  'margin-inline', 'margin-left', 'margin-right', 'margin-inline-start', 'margin-inline-end',
  'padding-inline', 'padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end',
  'border-inline-width', 'border-left-width', 'border-right-width',
  'border-style', 'border-top-style', 'border-bottom-style', 'border-block-style', 'border-inline-style',
  'border-color', 'border-top-color', 'border-bottom-color',
  // Lues par `interligne()`, pas par la boîte.
  'font-size', 'line-height',
  'font-weight', 'font-style', 'font-family', 'font-variant-numeric', 'letter-spacing',
  'text-transform', 'text-align', 'text-decoration-line', 'text-underline-offset', 'text-wrap',
  'word-break', 'overflow-wrap', 'vertical-align',
  'box-shadow', 'outline', 'outline-style', 'outline-width', 'outline-offset', 'outline-color',
  'transition-property', 'transition-timing-function', 'transition-duration', 'animation',
  'scale', 'translate', 'rotate', 'cursor', 'opacity', 'visibility', 'pointer-events',
  'user-select', 'isolation', 'flex-shrink', 'content',
]);

/** L'affichage par défaut des balises rendues ici (sans classe `display`). */
const DISPLAY_PAR_DEFAUT: Record<string, string> = {
  SPAN: 'inline', A: 'inline', IMG: 'inline', BUTTON: 'inline-block', LI: 'list-item',
};

/** Les valeurs d'un raccourci à 1-4 côtés : [haut, bas]. */
function hautBas(valeur: string): [number, number] {
  const v = valeur.split(/\s+(?![^(]*\))/).map(enPx);
  return [v[0], v.length >= 3 ? v[2] : v[0]];
}
/** Les valeurs d'un raccourci logique `-block` à 1-2 valeurs : [début, fin]. */
function debutFin(valeur: string): [number, number] {
  const v = valeur.split(/\s+(?![^(]*\))/).map(enPx);
  return [v[0], v[1] ?? v[0]];
}

export interface Modele {
  readonly classes: string;
  display: string;
  position: string;
  colonne: boolean;
  /** `height` déclarée (px), ou undefined : la hauteur suit alors le contenu. */
  hauteur?: number;
  minHauteur?: number;
  maxHauteur?: number;
  rembHaut: number;
  rembBas: number;
  filetHaut: number;
  filetBas: number;
  margeHaut: number;
  margeBas: number;
  ecart: number;
  lignes?: number;
  /** `space-y-*` : marges posées sur chaque enfant sauf le dernier. */
  enfantsMargeHaut: number;
  enfantsMargeBas: number;
}

/** La marge d'un `space-y-*` (sens normal : tout en bas, rien en haut). LÈVE sur toute autre forme. */
function espacement(valeur: string): number {
  const m = valeur.match(/^calc\((calc\(var\(--spacing\) \* [\d.]+\)) \* (calc\(1 - var\(--tw-space-y-reverse\)\)|var\(--tw-space-y-reverse\))\)$/);
  if (!m) throw new Error(`espacement illisible : ${valeur}`);
  return m[2].startsWith('calc') ? enPx(m[1]) : 0;
}

/**
 * Un `::before`/`::after` n'ajoute RIEN à la hauteur s'il est hors du flux (`absolute`/`fixed`
 * sous TOUTES ses déclarations de `position`, variantes d'état comprises) ou jamais affiché
 * (`display: none` sous toutes). Tout autre pseudo-élément — dès qu'une classe `before:`/`after:`
 * existe, Tailwind 4 le génère (`content: var(--tw-content)`) — LÈVE : il occuperait le flux.
 */
function verifierPseudosHorsFlux(declarations: readonly Declaration[], ou: string) {
  for (const pseudo of ['before', 'after'] as const) {
    const d = declarations.filter((x) => x.pseudo === pseudo && !x.propriete.startsWith('--'));
    if (!d.length) continue;
    const valeurs = (p: string) => d.filter((x) => x.propriete === p).map((x) => x.valeur);
    const positions = valeurs('position');
    const affichages = valeurs('display');
    const horsFlux = positions.length > 0 && positions.every((v) => v === 'absolute' || v === 'fixed');
    const jamaisAffiche = affichages.length > 0 && affichages.every((v) => v === 'none');
    if (!horsFlux && !jamaisAffiche) {
      throw new Error(`::${pseudo} dans le flux — sa hauteur n'est pas modélisée ${ou}`);
    }
  }
}

/** Le modèle vertical d'UN élément, à une largeur. LÈVE sur toute propriété non modélisée. */
export async function modele(el: Element, largeur: number): Promise<Modele> {
  const classes = el.getAttribute('class') ?? '';
  const m: Modele = {
    classes,
    display: DISPLAY_PAR_DEFAUT[el.tagName] ?? 'block',
    position: 'static',
    colonne: false,
    rembHaut: 0,
    rembBas: 0,
    filetHaut: 0,
    filetBas: 0,
    margeHaut: 0,
    margeBas: 0,
    ecart: 0,
    enfantsMargeHaut: 0,
    enfantsMargeBas: 0,
  };
  let sansRetour = false;
  const ou = `(« ${classes} »)`;
  const declarations = await declarationsA(el, largeur);
  verifierPseudosHorsFlux(declarations, ou);

  // LA CASCADE : hors variante d'état, la DERNIÈRE déclaration émise l'emporte (Tailwind émet le
  // raccourci avant le côté : `py-1.5 pt-0` rend un haut de 0, pas le maximum des deux — mesuré
  // à la seconde reprise, le maximum laissait un saut de 6 px invisible). Les variantes d'état
  // viennent ENSUITE, et ne font que grandir la boîte (le pire).
  type Champ = 'rembHaut' | 'rembBas' | 'filetHaut' | 'filetBas' | 'margeHaut' | 'margeBas' | 'ecart' | 'enfantsMargeHaut' | 'enfantsMargeBas';
  const ordonnees = [...declarations.filter((d) => !d.etat), ...declarations.filter((d) => d.etat)];
  for (const d of ordonnees) {
    if (d.pseudo !== null || d.propriete.startsWith('--')) continue;
    const fixer = (champ: Champ, valeur: number) => {
      m[champ] = d.etat ? Math.max(m[champ], valeur) : valeur;
    };
    const fixerOptionnel = (champ: 'hauteur' | 'minHauteur', valeur: number) => {
      m[champ] = d.etat && m[champ] !== undefined ? Math.max(m[champ]!, valeur) : valeur;
    };
    if (d.enfants) {
      if (d.propriete === 'margin-block-start') fixer('enfantsMargeHaut', espacement(d.valeur));
      else if (d.propriete === 'margin-block-end') fixer('enfantsMargeBas', espacement(d.valeur));
      else throw new Error(`${d.propriete} posé sur les enfants — non modélisé ${ou}`);
      continue;
    }
    const v = d.valeur;
    switch (d.propriete) {
      case 'display':
      case 'position':
        if (d.etat) throw new Error(`${d.propriete} sous une variante d'état — non modélisé ${ou}`);
        m[d.propriete] = v;
        break;
      case 'flex-direction':
        if (d.etat) throw new Error(`flex-direction sous une variante d'état — non modélisé ${ou}`);
        m.colonne = v.startsWith('column');
        break;
      case 'flex-wrap':
        if (v !== 'nowrap') throw new Error(`flex-wrap: ${v} — plusieurs rangées, non modélisé ${ou}`);
        break;
      case 'height':
      case 'block-size':
        if (v === 'auto') {
          if (d.etat) throw new Error(`height: auto sous une variante d'état — non modélisé ${ou}`);
          m.hauteur = undefined;
        } else fixerOptionnel('hauteur', enPx(v));
        break;
      case 'min-height':
      case 'min-block-size':
        fixerOptionnel('minHauteur', enPx(v));
        break;
      case 'max-height':
      case 'max-block-size':
        // Un plafond sous variante d'état ne fait que RÉDUIRE la boîte : le pire est de l'ignorer.
        if (!d.etat) m.maxHauteur = v === 'none' ? undefined : enPx(v);
        break;
      case 'padding': {
        const [h, b] = hautBas(v);
        fixer('rembHaut', h);
        fixer('rembBas', b);
        break;
      }
      case 'padding-block': {
        const [h, b] = debutFin(v);
        fixer('rembHaut', h);
        fixer('rembBas', b);
        break;
      }
      case 'padding-top':
      case 'padding-block-start':
        fixer('rembHaut', enPx(v));
        break;
      case 'padding-bottom':
      case 'padding-block-end':
        fixer('rembBas', enPx(v));
        break;
      case 'margin': {
        const [h, b] = hautBas(v);
        fixer('margeHaut', h);
        fixer('margeBas', b);
        break;
      }
      case 'margin-block': {
        const [h, b] = debutFin(v);
        fixer('margeHaut', h);
        fixer('margeBas', b);
        break;
      }
      case 'margin-top':
      case 'margin-block-start':
        fixer('margeHaut', enPx(v));
        break;
      case 'margin-bottom':
      case 'margin-block-end':
        fixer('margeBas', enPx(v));
        break;
      case 'border-width': {
        const [h, b] = hautBas(v);
        fixer('filetHaut', h);
        fixer('filetBas', b);
        break;
      }
      case 'border-block-width': {
        const [h, b] = debutFin(v);
        fixer('filetHaut', h);
        fixer('filetBas', b);
        break;
      }
      case 'border-top-width':
      case 'border-block-start-width':
        fixer('filetHaut', enPx(v));
        break;
      case 'border-bottom-width':
      case 'border-block-end-width':
        fixer('filetBas', enPx(v));
        break;
      case 'gap':
        fixer('ecart', enPx(v.split(/\s+(?![^(]*\))/)[0]));
        break;
      case 'row-gap':
        fixer('ecart', enPx(v));
        break;
      case '-webkit-line-clamp': {
        const n = Number(v);
        if (!Number.isInteger(n)) throw new Error(`line-clamp illisible : ${v} ${ou}`);
        m.lignes = d.etat && m.lignes !== undefined ? Math.max(m.lignes, n) : n;
        break;
      }
      case 'white-space':
        // Sous variante d'état, seul un retour à la ligne PERMIS compte (le pire).
        sansRetour = d.etat ? sansRetour && v === 'nowrap' : v === 'nowrap';
        break;
      case 'aspect-ratio':
        throw new Error(`aspect-ratio: ${v} — hauteur proportionnelle à la largeur ${ou}`);
      default:
        if (!NEUTRES.has(d.propriete)) {
          throw new Error(`propriété non modélisée : ${d.propriete}: ${v} ${ou}`);
        }
    }
  }
  if (m.lignes === undefined && sansRetour) m.lignes = 1;
  // L'attribut HTML `hidden` (Preflight : `display: none !important`) l'emporte sur toute classe.
  if (el.hasAttribute('hidden')) m.display = 'none';
  return m;
}

/**
 * L'affichage (`display`) d'un élément à une largeur donnée — `none` si LUI ou l'un de ses
 * ANCÊTRES ne s'affiche pas : un bloc sous un parent `hidden` n'existe pas plus que s'il l'était
 * lui-même (`<div aria-busy className="hidden">` laissait « le squelette mobile affiché »).
 */
export async function affichage(el: Element, largeur: number): Promise<string> {
  const propre = await displayPropre(el, largeur);
  for (let n = el.parentElement; n; n = n.parentElement) {
    if ((await displayPropre(n, largeur)) === 'none') return 'none';
  }
  return propre;
}

/**
 * Pourquoi un élément ne se VOIT pas à cette largeur — ou `null` s'il se voit : `display: none`
 * (lui ou un ancêtre), `visibility` héritée non `visible`, ou une opacité ≤ 10 % sur lui ou un
 * ancêtre (au pire des variantes d'état). Un bloc `opacity-0` ou `invisible` occupe sa place et
 * n'est pas « affiché » pour qui regarde l'écran.
 */
export async function nonVu(el: Element, largeur: number): Promise<string | null> {
  if ((await affichage(el, largeur)) === 'none') return 'display: none (lui ou un ancêtre)';
  const visibilite = await herite(el, largeur, 'visibility', /^(hidden|collapse)$/);
  if (visibilite !== undefined && visibilite !== 'visible') return `visibility: ${visibilite}`;
  for (let n: Element | null = el; n; n = n.parentElement) {
    for (const d of await declarationsA(n, largeur)) {
      if (d.pseudo !== null || d.enfants || d.propriete !== 'opacity') continue;
      const o = d.valeur.endsWith('%') ? Number(d.valeur.slice(0, -1)) / 100 : Number(d.valeur);
      if (!Number.isFinite(o)) throw new Error(`opacité illisible : ${d.valeur}`);
      if (o <= 0.1) return `opacity: ${d.valeur} (« ${n.getAttribute('class')} »)`;
    }
  }
  return null;
}

/** Le seul `display` d'un élément (sans le reste de son modèle, que ses ancêtres n'ont pas à tenir). */
async function displayPropre(el: Element, largeur: number): Promise<string> {
  const d = (await declarationsA(el, largeur)).filter((x) => x.propriete === 'display' && x.pseudo === null && !x.enfants);
  if (d.some((x) => x.etat)) throw new Error(`display sous une variante d'état — non modélisé (« ${el.getAttribute('class')} »)`);
  // L'attribut HTML `hidden` : Preflight le rend `display: none !important`, classes comprises.
  if (el.hasAttribute('hidden')) return 'none';
  return d.at(-1)?.valeur ?? DISPLAY_PAR_DEFAUT[el.tagName] ?? 'block';
}

/**
 * La hauteur de ligne d'un texte : `line-height` et `font-size` hérités de l'ancêtre le plus
 * proche qui les déclare (un facteur sans unité multiplie la taille du texte lui-même).
 */
async function interligne(el: Element, largeur: number): Promise<number> {
  let hauteurDeLigne: string | undefined;
  let taille: number | undefined;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const d = (await declarationsA(n, largeur)).filter((x) => x.pseudo === null && !x.enfants);
    const derniere = (p: string) => d.filter((x) => x.propriete === p).at(-1)?.valeur;
    if (hauteurDeLigne === undefined && derniere('line-height') !== undefined) {
      hauteurDeLigne = derniere('line-height')!;
      const repli = hauteurDeLigne.match(/^var\(--tw-leading, (.*)\)$/);
      if (repli) hauteurDeLigne = derniere('--tw-leading') ?? repli[1];
    }
    if (taille === undefined && derniere('font-size') !== undefined) taille = enPx(derniere('font-size')!);
    if (hauteurDeLigne !== undefined && taille !== undefined) break;
  }
  taille ??= 16;
  if (hauteurDeLigne === undefined) throw new Error('interligne « normal » : non modélisé');
  let v = hauteurDeLigne;
  const jeton = v.match(/^var\((--[\w-]+)\)$/);
  if (jeton) v = THEME[jeton[1]] ?? v;
  if (/^[\d.]+$/.test(v)) return Number(v) * taille;
  const rapport = v.match(/^calc\(([\d.]+) \/ ([\d.]+)\)$/);
  if (rapport) return (Number(rapport[1]) / Number(rapport[2])) * taille;
  return enPx(v);
}

export interface Boite {
  readonly hauteur: number;
  readonly margeHaut: number;
  readonly margeBas: number;
  /** `absolute`, `fixed` ou `display: none` : n'occupe aucune place dans le flux. */
  readonly horsFlux: boolean;
}

const EN_LIGNE = (m: Modele) =>
  m.display === 'grid' || m.display === 'inline-grid' || ((m.display === 'flex' || m.display === 'inline-flex') && !m.colonne);

/** Une grille de ce modèle n'a qu'UNE rangée : `repeat(N, …)` en style, au plus N enfants. */
function verifierUneRangee(el: Element, m: Modele) {
  if (!m.display.endsWith('grid') || el.children.length <= 1) return;
  const colonnes = (el as HTMLElement).style?.gridTemplateColumns?.match(/^repeat\((\d+),/)?.[1];
  if (!colonnes || el.children.length > Number(colonnes)) {
    throw new Error(`grille de plusieurs rangées — non modélisé (« ${m.classes} »)`);
  }
}

/** La hauteur de BORDURE (box-sizing: border-box, celle de Preflight) d'un élément, et ses marges. */
export async function boite(el: Element, largeur: number): Promise<Boite> {
  const m = await modele(el, largeur);
  if (m.display === 'none') return { hauteur: 0, margeHaut: 0, margeBas: 0, horsFlux: true };
  if (m.position === 'absolute' || m.position === 'fixed') {
    return { hauteur: 0, margeHaut: 0, margeBas: 0, horsFlux: true };
  }
  // Une boîte EN LIGNE ignore `height` et ses bornes : le modèle les appliquerait (`inline h-14`
  // sur le cadre : 14/14 verts, la vignette tombait à 0 px au navigateur).
  if (m.display === 'inline' && [m.hauteur, m.minHauteur, m.maxHauteur].some((v) => v !== undefined)) {
    throw new Error(`hauteur posée sur une boîte en ligne — sans effet au navigateur, non modélisé (« ${m.classes} »)`);
  }
  const cadre = m.rembHaut + m.rembBas + m.filetHaut + m.filetBas;
  let h = m.hauteur !== undefined ? Math.max(m.hauteur, cadre) : (await contenu(el, m, largeur)) + cadre;
  if (m.maxHauteur !== undefined) h = Math.min(h, m.maxHauteur);
  if (m.minHauteur !== undefined) h = Math.max(h, m.minHauteur);
  return { hauteur: h, margeHaut: m.margeHaut, margeBas: m.margeBas, horsFlux: false };
}

async function contenu(el: Element, m: Modele, largeur: number): Promise<number> {
  const elements = [...el.children];
  const texte = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '');
  if (!elements.length) {
    if (!texte) return 0;
    if (m.lignes === undefined) {
      throw new Error(`texte libre, sans nombre de lignes borné : sa hauteur dépend de la largeur (« ${m.classes} »)`);
    }
    return m.lignes * (await interligne(el, largeur));
  }
  if (texte) throw new Error(`texte et éléments mêlés — non modélisé (« ${m.classes} »)`);
  if (m.display === 'inline') throw new Error(`élément en ligne qui contient des blocs — non modélisé (« ${m.classes} »)`);
  verifierUneRangee(el, m);
  if (!EN_LIGNE(m) && m.display !== 'flex' && m.display !== 'inline-flex') {
    // Dans un flux de BLOCS, un enfant en ligne (`inline-block w-full` sur le cadre) ouvre une
    // boîte de ligne : ligne de base, jambage, interligne — +7 px au navigateur, 14/14 verts ici.
    for (const e of elements) {
      const me = await modele(e, largeur);
      if (me.display.startsWith('inline') && me.position !== 'absolute' && me.position !== 'fixed') {
        throw new Error(`enfant « ${me.display} » dans un flux de blocs — boîte de ligne non modélisée (« ${me.classes} »)`);
      }
    }
  }
  const exterieures = (await Promise.all(elements.map(async (e) => ({ e, b: await boite(e, largeur) }))))
    .filter(({ b }) => !b.horsFlux)
    .map(({ e, b }) => b.hauteur + b.margeHaut + b.margeBas + margesDEnfant(el, m, e));
  if (!exterieures.length) return 0;
  if (EN_LIGNE(m)) return Math.max(...exterieures);
  return exterieures.reduce((a, b) => a + b, 0) + (m.colonne ? m.ecart * (exterieures.length - 1) : 0);
}

/** Ce qu'un `space-y-*` du parent ajoute à un enfant (tous sauf le DERNIER élément du DOM). */
function margesDEnfant(parent: Element, m: Modele, enfant: Element): number {
  return enfant === parent.lastElementChild ? 0 : m.enfantsMargeHaut + m.enfantsMargeBas;
}

/** La hauteur occupée dans le flux, marges comprises. */
export async function hauteurExterieure(el: Element, largeur: number): Promise<number> {
  const b = await boite(el, largeur);
  return b.hauteur + b.margeHaut + b.margeBas;
}

/**
 * Le décalage vertical du bord supérieur de `cible` (sa bordure) sous le début du contenu de
 * `parent` — ou, avec `apres`, sous la fin de ce frère de départ (exclu). Les frères qui
 * précèdent, à chaque niveau, sont mesurés par `boite()` ; les rembourrages et filets des
 * conteneurs traversés, par `modele()`.
 *
 * LÈVE si la cible n'est pas VUE à cette largeur (`nonVu()` : elle ou un ancêtre en
 * `display: none`, `invisible`, `opacity-0`) : la position d'un bloc que personne ne voit ne dit
 * rien de ce que l'utilisateur lit.
 */
export async function decalage(
  parent: Element,
  cible: Element,
  largeur: number,
  apres: Element | null = null,
): Promise<number> {
  const raison = await nonVu(cible, largeur);
  if (raison !== null) {
    throw new Error(`la cible n’est pas vue à ${largeur} px — ${raison} (« ${cible.getAttribute('class') ?? cible.tagName} »)`);
  }
  let conteneur = parent;
  let depart = apres;
  let y = 0;
  for (;;) {
    const m = await modele(conteneur, largeur);
    const enfant = [...conteneur.children].find((e) => e === cible || e.contains(cible));
    if (!enfant) throw new Error('la cible n’est pas dans le conteneur');
    verifierUneRangee(conteneur, m);
    if (!EN_LIGNE(m)) {
      let compte = depart === null;
      for (const frere of conteneur.children) {
        if (frere === enfant) break;
        if (compte) {
          const b = await boite(frere, largeur);
          if (!b.horsFlux) y += b.hauteur + b.margeHaut + b.margeBas + margesDEnfant(conteneur, m, frere) + (m.colonne ? m.ecart : 0);
        }
        if (frere === depart) compte = true;
      }
    }
    const e = await modele(enfant, largeur);
    y += e.margeHaut + (enfant === conteneur.lastElementChild ? 0 : m.enfantsMargeHaut);
    if (enfant === cible) return y;
    y += e.filetHaut + e.rembHaut;
    conteneur = enfant;
    depart = null;
  }
}

export interface CibleTactile {
  readonly largeur: number;
  readonly hauteur: number;
  /**
   * L'élément lui-même et TOUS ses ancêtres, jusqu'à la racine, dont un `overflow` autre que
   * `visible` rognerait la zone. Conservateur : un ancêtre loin de la cible y figure aussi.
   */
  readonly rognePar: readonly string[];
  /** Pourquoi une part de la zone ne reçoit pas l'appui (`display`, `pointer-events`, `visibility`). */
  readonly exclusions: readonly string[];
}

/** Ce qu'un `::after` d'agrandissement peut déclarer. Toute autre propriété LÈVE (`after:size-4`…). */
const PSEUDO_CIBLE = new Set([
  'position', 'content', 'inset', 'inset-inline', 'inset-block', 'top', 'right', 'bottom', 'left',
  'display', 'pointer-events', 'visibility', 'border-radius', 'z-index',
]);

/** Les longueurs d'un raccourci à 1-4 côtés : [haut, droite, bas, gauche]. */
function quatreCotes(valeur: string): [number, number, number, number] {
  const v = valeur.split(/\s+(?![^(]*\))/).map(enPx);
  return [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
}

/**
 * La valeur HÉRITÉE d'une propriété (`pointer-events`, `visibility`) : celle de l'élément ou du
 * plus proche ancêtre qui la déclare, au PIRE de ses variantes (un `hover:pointer-events-none`
 * compte comme `none`).
 */
async function herite(el: Element, largeur: number, propriete: string, pire: RegExp): Promise<string | undefined> {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const v = (await declarationsA(n, largeur))
      .filter((d) => d.pseudo === null && !d.enfants && d.propriete === propriete)
      .map((d) => d.valeur);
    if (v.length) return v.find((x) => pire.test(x)) ?? v.at(-1);
  }
  return undefined;
}

/**
 * La zone d'appui d'un élément : sa propre boîte, UNIE à celle de son `::after` positionné (le
 * patron « 28 px dessinés, 44 px d'appui » : `after:absolute after:-inset-2`).
 *
 * Seconde reprise (vérification adverse du 2026-09-24) : `after:hidden`, `after:pointer-events-none`
 * et un `overflow-hidden` sur la liste des vignettes laissaient 13/13 verts, la cible mesurant
 * 28 × 28, 28 × 28 et 40 × 40 au navigateur (`elementFromPoint`). Désormais une part de zone
 * non affichée, invisible ou sans `pointer-events` ne compte pas, et le rognage se cherche sur
 * TOUTE la chaîne d'ancêtres — la liste qui rognait était justement la borne où l'ancien parcours
 * s'arrêtait.
 */
export async function cibleTactile(el: Element, largeur: number): Promise<CibleTactile> {
  const exclusions: string[] = [];
  const rognePar: string[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const d = (await declarationsA(n, largeur)).filter((x) => x.pseudo === null && !x.enfants);
    if (d.some((x) => /^overflow(-[xy])?$/.test(x.propriete) && x.valeur !== 'visible')) {
      rognePar.push(n.getAttribute('class') ?? n.tagName);
    }
    // Une mise à l'échelle (hors pression : `active:scale-[0.96]` ne dure que le temps de l'appui)
    // réduit la zone d'appui avec le dessin : non modélisée, elle LÈVE (`scale-50` : 13/13 verts).
    const echelle = d.find((x) => !x.etat && /^(scale|transform|rotate|zoom)$/.test(x.propriete));
    if (echelle) {
      throw new Error(`${echelle.propriete}: ${echelle.valeur} sur « ${n.getAttribute('class') ?? n.tagName} » — non modélisé pour la cible tactile`);
    }
  }
  const raison = await nonVu(el, largeur);
  if (raison !== null) return { largeur: 0, hauteur: 0, rognePar, exclusions: [raison] };

  const toutes = await declarationsA(el, largeur);
  const propres = toutes.filter((d) => d.pseudo === null && !d.enfants && !d.propriete.startsWith('--'));
  const apres = toutes.filter((d) => d.pseudo === 'after' && !d.propriete.startsWith('--'));
  const derniere = (liste: Declaration[], p: string) => liste.filter((d) => d.propriete === p).at(-1)?.valeur;
  const toutesLes = (liste: Declaration[], p: string) => liste.filter((d) => d.propriete === p).map((d) => d.valeur);
  const px = (liste: Declaration[], p: string) => {
    const v = derniere(liste, p);
    return v === undefined || v === 'auto' || v === 'none' ? undefined : enPx(v);
  };
  for (const d of apres) {
    if (!PSEUDO_CIBLE.has(d.propriete)) {
      throw new Error(`::after — ${d.propriete}: ${d.valeur} non modélisé pour la cible tactile (« ${el.getAttribute('class')} »)`);
    }
  }

  const evenements = (await herite(el, largeur, 'pointer-events', /^none$/)) ?? 'auto';
  const visibilite = (await herite(el, largeur, 'visibility', /^(hidden|collapse)$/)) ?? 'visible';
  const recoit = (pe: string, vis: string) => pe !== 'none' && vis === 'visible';

  // La taille retenue : max(min, min(taille, max)) — `size-7 max-w-4` fait 16 px de large, pas 28.
  const retenue = (taille: string, mini: string, maxi: string) =>
    Math.max(px(propres, mini) ?? 0, Math.min(px(propres, taille) ?? 0, px(propres, maxi) ?? Infinity));
  const largeurPropre = retenue('width', 'min-width', 'max-width');
  const hauteurPropre = retenue('height', 'min-height', 'max-height');
  // La zone : [gauche, droite, haut, bas] dans le repère de l'élément ; vide tant que rien ne la pose.
  let zone: [number, number, number, number] | null = null;
  const unir = (g: number, dr: number, h: number, b: number) => {
    zone = zone ? [Math.min(zone[0], g), Math.max(zone[1], dr), Math.min(zone[2], h), Math.max(zone[3], b)] : [g, dr, h, b];
  };
  if (recoit(evenements, visibilite)) unir(0, largeurPropre, 0, hauteurPropre);
  else exclusions.push(`l’élément : pointer-events ${evenements}, visibility ${visibilite}`);

  if (apres.length) {
    const positionne = ['relative', 'absolute', 'fixed', 'sticky'].includes(derniere(propres, 'position') ?? 'static');
    const positions = toutesLes(apres, 'position');
    const peApres = toutesLes(apres, 'pointer-events');
    const visApres = toutesLes(apres, 'visibility');
    const pe = peApres.find((v) => v === 'none') ?? peApres.at(-1) ?? evenements;
    const vis = visApres.find((v) => v !== 'visible') ?? visApres.at(-1) ?? visibilite;
    const zApres = toutesLes(apres, 'z-index').map((v) => Number.parseFloat(v));
    if (toutesLes(apres, 'display').some((v) => v === 'none')) exclusions.push('::after : display none');
    // `content: none` supprime le pseudo-élément ; un `z-index` négatif le peint SOUS le cadre, qui
    // reçoit alors l'appui à sa place (`after:content-none`, `after:-z-10` : 28 × 28 au navigateur).
    else if (toutesLes(apres, 'content').some((v) => v === 'none')) exclusions.push('::after : content none');
    else if (zApres.some((z) => Number.isNaN(z) || z < 0)) exclusions.push('::after : z-index négatif ou illisible');
    else if (!positionne || !positions.length || positions.some((v) => v !== 'absolute')) {
      exclusions.push('::after : non positionné en absolu dans l’élément');
    } else if (!recoit(pe, vis)) exclusions.push(`::after : pointer-events ${pe}, visibility ${vis}`);
    else {
      const cotes: Record<'top' | 'right' | 'bottom' | 'left', number | undefined> = {
        top: undefined, right: undefined, bottom: undefined, left: undefined,
      };
      for (const d of apres) {
        if (d.propriete === 'inset') [cotes.top, cotes.right, cotes.bottom, cotes.left] = quatreCotes(d.valeur);
        else if (d.propriete === 'inset-inline') [cotes.left, cotes.right] = debutFin(d.valeur);
        else if (d.propriete === 'inset-block') [cotes.top, cotes.bottom] = debutFin(d.valeur);
        else if (d.propriete in cotes) cotes[d.propriete as keyof typeof cotes] = d.valeur === 'auto' ? undefined : enPx(d.valeur);
      }
      if ([cotes.top, cotes.right, cotes.bottom, cotes.left].some((c) => c === undefined)) {
        exclusions.push('::after : décalages incomplets, taille non modélisée');
      } else {
        unir(cotes.left!, largeurPropre - cotes.right!, cotes.top!, hauteurPropre - cotes.bottom!);
      }
    }
  }
  const [g, dr, h, b] = zone ?? [0, 0, 0, 0];
  return { largeur: dr - g, hauteur: b - h, rognePar, exclusions };
}
