/**
 * LES COUPLES TEXTE/FOND D'UN ARBRE DE SOURCES, MESURÉS — TCK-458 (AC2, AC4, AC5), TCK-459 (AC2).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE AJOUTE À `contraste-wcag.ts`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `contraste-wcag.ts` mesure un couple sur un DOM RENDU : c'est la mesure la plus fidèle, et elle
 * exige de monter le composant — donc ses `props`, ses mocks, son contexte. C'est ce qui a limité
 * la garde de TCK-440 à deux composants, et TCK-458 nomme cette limite : *« une mesure juste sur un
 * périmètre étroit produit une fausse assurance : on croit avoir mesuré le contraste, on a mesuré
 * deux fichiers. »*
 *
 * Ce module-ci mesure les mêmes couples SANS monter quoi que ce soit, en lisant l'arbre JSX
 * (`analyse-statique.ts`). Il perd la fidélité du rendu ; il gagne le PÉRIMÈTRE. Les deux gardes
 * coexistent, et c'est délibéré : la première prouve un écran, la seconde couvre une surface.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES QUATRE RÈGLES DE FOND, ET LEUR JUSTIFICATION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  1. **Fond propre opaque** → on mesure dessus. Rien à décider.
 *  2. **Fond propre translucide + un ancêtre opaque DANS LE FICHIER** → composition sur cet
 *     ancêtre. C'est ce que fait le navigateur, et c'est ce que `fondHerite()` fait au rendu.
 *  3. **Aucun fond propre** → l'encre est jugée sur les DEUX surfaces canoniques, `--card` et
 *     `--background`. Pas sur celle qui arrange : *le sens de l'écart entre les deux s'inverse
 *     avec le thème* — `--card` est plus contrasté en clair, moins en sombre (relevé de TCK-440).
 *  4. **Fond propre translucide SANS ancêtre opaque** → le sous-jacent est INCONNU, et un fond
 *     semi-transparent ne garantit alors rien par construction. On prend le pire cas par
 *     {@link pireFondSurMedia} — balayage des 256 gris, jamais une extrémité choisie.
 *
 *     ⚠ La règle 4 est **volontairement pessimiste** : un élément qui, en vrai, repose sur une
 *     section de page unie y est jugé comme s'il reposait sur une photo. C'est le bon sens de
 *     l'erreur — le fichier ne dit pas où son appelant le pose, et une garde qui suppose le fond
 *     favorable ne garde rien. Le verdict porte donc le `pire` à `true`, pour que le rapport
 *     distingue « mesuré sur un fond connu » de « pire cas d'un fond inconnu ».
 *
 * ⚠ **Les jetons hors du design system ne sont PAS mesurés, ils sont COMPTÉS.** `text-stone-600`
 * n'a aucune valeur dans `globals.css` ; l'inventer ici ferait de ce module une seconde palette à
 * maintenir. Ils sortent en {@link Lecture.horsJetons}, et c'est à l'appelant d'en faire un
 * cliquet — leur conversion est le sujet de la famille TCK-440, pas celui-ci.
 */
import {
  type Rvb,
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  contraste,
  composer,
  litUtilitaireDeCouleur,
  pireFondSurMedia,
  resoudreCouleur,
  versHex,
  versRvb,
} from './contraste-wcag';
import { type GroupeDeClasses, groupesDeClasses } from './analyse-statique';

/** Les deux surfaces sur lesquelles toute encre du design system doit tenir. */
export const SURFACES_CANONIQUES = ['card', 'background'] as const;

export interface CoupleMesure {
  readonly fichier: string;
  readonly ligne: number;
  readonly balise: string;
  /** `text-white`, `hover:text-primary/80`… tel qu'il est écrit. */
  readonly encre: string;
  /** D'où vient le fond : `bg-foreground`, `--card`, `bg-accent/90 sur un sous-jacent inconnu`… */
  readonly fond: string;
  readonly hexEncre: string;
  readonly hexFond: string;
  readonly ratio: number;
  /** Le fond est un PIRE CAS de sous-jacent inconnu (règle 4), pas un fond connu. */
  readonly pire: boolean;
  /** L'élément porte du texte : 4,5:1 (1.4.3). Sinon 3:1 (1.4.11). AC5 de TCK-458. */
  readonly texte: boolean;
  readonly seuil: number;
}

export interface Lecture {
  readonly couples: readonly CoupleMesure[];
  /** `fichier: classe` pour chaque utilitaire dont le jeton n'existe pas dans `globals.css`. */
  readonly horsJetons: readonly string[];
  /**
   * Les encres INVERSES laissées de côté, avec leur site.
   *
   * `text-primary-foreground`, `text-background`, `text-white` : ces encres sont faites pour être
   * posées SUR une surface colorée, et quand leur groupe ne déclare aucun fond, cette surface est
   * chez un ancêtre que le fichier ne pose pas inconditionnellement (souvent une branche :
   * `isNavbar ? 'bg-card/10 text-primary-foreground' : …`). Les mesurer contre `--card` rendrait
   * 1,05:1 — un rouge inventé sur du code juste, exactement ce que la garde de la chrome écarte
   * déjà de son côté (`if (jeton === 'background' || jeton === 'primary-foreground') continue`).
   *
   * ⚠ C'est un TROU, et il est déclaré plutôt que masqué : un texte inverse posé sur la mauvaise
   * surface ne sera pas attrapé ici. Il l'est quand son fond est écrit dans le même groupe — ce
   * qui est le cas des deux variantes de la pastille de contrat, donc du couple de TCK-458.
   */
  readonly encresInverses: readonly string[];
}

interface Utilitaire { readonly variante: string; readonly jeton: string; readonly alpha: number }

function nommerUtilitaire(prefixe: string, u: Utilitaire): string {
  const base = `${prefixe}-${u.jeton}${u.alpha === 1 ? '' : `/${Math.round(u.alpha * 100)}`}`;
  return u.variante ? `${u.variante}:${base}` : base;
}

/**
 * Les variantes qui désignent un PSEUDO-ÉLÉMENT : leur fond n'est pas celui de l'élément.
 *
 * `after:bg-foreground` peint une barre d'onglet actif, pas le fond du libellé — les apparier
 * donnait `text-foreground/70 sur after:bg-foreground = 1,00:1`, un couple que personne n'affiche.
 */
const PSEUDO_ELEMENTS = /(^|:)(after|before|selection|marker|backdrop|file|first-line|first-letter)(:|$)/;

/** Une encre faite pour une surface colorée, et qui n'a donc pas de sens contre `--card`. */
function estEncreInverse(jeton: string): boolean {
  return jeton.endsWith('-foreground')
    || jeton === 'background' || jeton === 'card' || jeton === 'popover'
    || jeton === 'sidebar' || jeton === 'white';
}

function utilitaires(classes: readonly string[], prefixe: 'bg' | 'text'): Utilitaire[] {
  return classes
    .map((c) => litUtilitaireDeCouleur(c, prefixe))
    .filter((u): u is Utilitaire => u !== null && u.jeton !== 'transparent' && u.jeton !== 'current'
      && u.jeton !== 'inherit');
}

/**
 * `cn()` = `twMerge(clsx(…))` : **dans une famille d'utilitaires, LA DERNIÈRE classe gagne.**
 *
 * Sans cette réduction, une pile de branches produit des couples impossibles. Mesuré sur
 * `BookingStepper` : `isCompleted && 'bg-foreground text-white'` suivi de
 * `isCurrent && 'bg-white text-foreground'` donnait `text-foreground sur bg-foreground` — 1,00:1,
 * et le pas est infranchissable pour un lecteur d'AST, les deux conditions étant exclusives sans
 * qu'aucune syntaxe ne le dise. La sémantique de `twMerge` tranche à sa place, et elle est exacte
 * ici : c'est ce que le navigateur reçoit.
 */
function derniereParVariante(us: readonly Utilitaire[]): Utilitaire[] {
  const parVariante = new Map<string, Utilitaire>();
  for (const u of us) parVariante.set(u.variante, u);
  return [...parVariante.values()];
}

/**
 * Le fond OPAQUE hérité des ancêtres du fichier, ou `null` si aucun ancêtre ne peint.
 *
 * Ne lit que les fonds INCONDITIONNELS des ancêtres (cf. `analyse-statique.ts`) : une branche
 * d'ancêtre n'est pas une certitude, et supposer la branche favorable serait exactement le geste
 * que ces gardes existent pour empêcher.
 */
function fondDesAncetres(
  ancetres: GroupeDeClasses['ancetres'],
  jetons: Readonly<Record<string, string>>,
  base: Rvb,
): Rvb | null {
  for (let i = 0; i < ancetres.length; i += 1) {
    const [peinture] = derniereParVariante(utilitaires(ancetres[i]!, 'bg')).filter((u) => u.variante === '');
    if (!peinture) continue;
    if (!Object.prototype.hasOwnProperty.call(jetons, peinture.jeton)) return null;
    const couleur = versRvb(resoudreCouleur(peinture.jeton, jetons));
    if (peinture.alpha === 1) return couleur;
    const dessous = fondDesAncetres(ancetres.slice(i + 1), jetons, base);
    return composer(couleur, dessous ?? base, peinture.alpha);
  }
  return null;
}

/**
 * Tous les couples d'un fichier, dans une table de jetons donnée.
 *
 * ⚠ `sombre` n'est pas cosmétique : une classe `dark:` ne s'applique QUE sous une portée `.dark`,
 * donc la mesurer avec la table CLAIRE apparie une peinture qui ne sera jamais posée à une encre
 * qui, elle, l'est. Mesuré : `text-muted-foreground sur dark:bg-input/30` rendait 1,00:1 en table
 * claire — un couple qui n'existe dans aucun rendu.
 *
 * ⚠ L'appariement se fait PAR ÉTAT : une encre `hover:` se mesure sur le fond `hover:` s'il
 * existe, et sur le fond de repos sinon. Apparier tout avec tout fabriquerait des couples qui ne
 * s'affichent jamais — c'est le rouge inventé décrit dans `analyse-statique.ts`.
 */
export function couplesDuFichier(
  fichier: string,
  jetons: Readonly<Record<string, string>>,
  sombre: boolean,
): Lecture {
  const vus = new Map<string, CoupleMesure>();
  const horsJetons: string[] = [];
  const encresInverses: string[] = [];

  const resoudre = (jeton: string): string | null =>
    Object.prototype.hasOwnProperty.call(jetons, jeton) ? resoudreCouleur(jeton, jetons) : null;
  const applicable = (u: Utilitaire) => sombre || !/(^|:)dark(:|$)/.test(u.variante);

  for (const groupe of groupesDeClasses(fichier)) {
    const encres = derniereParVariante(utilitaires(groupe.classes, 'text')).filter(applicable);
    if (encres.length === 0) continue;
    const fonds = derniereParVariante(utilitaires(groupe.classes, 'bg'))
      .filter(applicable)
      .filter((u) => !PSEUDO_ELEMENTS.test(u.variante));
    const seuil = groupe.texte ? SEUIL_AA_TEXTE : SEUIL_NON_TEXTUEL;

    const poser = (c: Omit<CoupleMesure, 'texte' | 'seuil'>) => {
      vus.set(cleDuCouple(c as CoupleMesure), { ...c, texte: groupe.texte, seuil });
    };

    for (const encre of encres) {
      const hexEncre = resoudre(encre.jeton);
      if (hexEncre === null) {
        horsJetons.push(`${groupe.fichier}: ${nommerUtilitaire('text', encre)}`);
        continue;
      }

      // Les fonds propres qui s'appliquent à CETTE encre : ceux de son état, sinon ceux du repos.
      const memeEtat = fonds.filter((f) => f.variante === encre.variante);
      const repos = fonds.filter((f) => f.variante === '');
      // Une encre de repos doit tenir dans TOUS les états de fond que son élément déclare —
      // SAUF ceux où l'élément change AUSSI d'encre. `bg-card/20 text-primary-foreground
      // hover:bg-card hover:text-primary` ne rend jamais `text-primary-foreground` sur `bg-card` :
      // au survol, les deux basculent ensemble. Mesuré : cet appariement-là donnait 1,05:1 sur
      // deux composants, un rouge que rien n'affiche.
      const etatsAvecEncrePropre = new Set(encres.map((e) => e.variante).filter(Boolean));
      const aMesurer = encre.variante === ''
        ? fonds.filter((f) => f.variante === '' || !etatsAvecEncrePropre.has(f.variante))
        : (memeEtat.length > 0 ? memeEtat : repos);

      if (aMesurer.length === 0 && estEncreInverse(encre.jeton)) {
        encresInverses.push(`${groupe.fichier}:${groupe.ligne} ${nommerUtilitaire('text', encre)}`);
        continue;
      }

      for (const surface of SURFACES_CANONIQUES) {
        const base = versRvb(resoudreCouleur(surface, jetons));
        const heritage = fondDesAncetres(groupe.ancetres, jetons, base);

        if (aMesurer.length === 0) {
          // Règle 3 — aucune peinture propre : l'encre est jugée sur la surface canonique, ou sur
          // ce que ses ancêtres posent.
          const fond = heritage ?? base;
          const posee = encre.alpha === 1 ? versRvb(hexEncre) : composer(versRvb(hexEncre), fond, encre.alpha);
          poser({
            fichier: groupe.fichier,
            ligne: groupe.ligne,
            balise: groupe.balise,
            encre: nommerUtilitaire('text', encre),
            fond: heritage ? `${versHex(heritage)} (ancêtre) sur --${surface}` : `--${surface}`,
            hexEncre: versHex(posee),
            hexFond: versHex(fond),
            ratio: contraste(posee, fond),
            pire: false,
          });
          continue;
        }

        for (const peinture of aMesurer) {
          const hexPeinture = resoudre(peinture.jeton);
          if (hexPeinture === null) {
            horsJetons.push(`${groupe.fichier}: ${nommerUtilitaire('bg', peinture)}`);
            continue;
          }
          const plaque = versRvb(hexPeinture);

          if (peinture.alpha === 1) {
            const posee = encre.alpha === 1 ? versRvb(hexEncre) : composer(versRvb(hexEncre), plaque, encre.alpha);
            poser({
              fichier: groupe.fichier,
              ligne: groupe.ligne,
              balise: groupe.balise,
              encre: nommerUtilitaire('text', encre),
              fond: nommerUtilitaire('bg', peinture),
              hexEncre: versHex(posee),
              hexFond: versHex(plaque),
              ratio: contraste(posee, plaque),
              pire: false,
            });
            continue;
          }

          if (heritage !== null) {
            // Règle 2 — un ancêtre opaque du fichier porte la plaque.
            const fond = composer(plaque, heritage, peinture.alpha);
            const posee = encre.alpha === 1 ? versRvb(hexEncre) : composer(versRvb(hexEncre), fond, encre.alpha);
            poser({
              fichier: groupe.fichier,
              ligne: groupe.ligne,
              balise: groupe.balise,
              encre: nommerUtilitaire('text', encre),
              fond: `${nommerUtilitaire('bg', peinture)} sur ${versHex(heritage)}`,
              hexEncre: versHex(posee),
              hexFond: versHex(fond),
              ratio: contraste(posee, fond),
              pire: false,
            });
            continue;
          }

          // Règle 4 — sous-jacent inconnu : le PIRE cas, par balayage des 256 gris.
          const pire = pireFondSurMedia(versRvb(hexEncre), plaque, peinture.alpha, encre.alpha);
          poser({
            fichier: groupe.fichier,
            ligne: groupe.ligne,
            balise: groupe.balise,
            encre: nommerUtilitaire('text', encre),
            fond: `${nommerUtilitaire('bg', peinture)} sur un sous-jacent inconnu (pire pixel ${pire.pixel})`,
            hexEncre: versHex(encre.alpha === 1 ? versRvb(hexEncre) : composer(versRvb(hexEncre), pire.fond, encre.alpha)),
            hexFond: versHex(pire.fond),
            ratio: pire.ratio,
            pire: true,
          });
        }
      }
    }
  }

  return {
    couples: [...vus.values()],
    horsJetons: [...new Set(horsJetons)],
    encresInverses: [...new Set(encresInverses)],
  };
}

/** Le même relevé sur plusieurs fichiers, dédoublonné sur la clé (fichier, encre, fond). */
export function couplesDesFichiers(
  fichiers: readonly string[],
  jetons: Readonly<Record<string, string>>,
  sombre: boolean,
): Lecture {
  const couples = new Map<string, CoupleMesure>();
  const horsJetons = new Set<string>();
  const encresInverses = new Set<string>();
  for (const fichier of fichiers) {
    const lecture = couplesDuFichier(fichier, jetons, sombre);
    for (const c of lecture.couples) couples.set(cleDuCouple(c), c);
    for (const h of lecture.horsJetons) horsJetons.add(h);
    for (const e of lecture.encresInverses) encresInverses.add(e);
  }
  return {
    couples: [...couples.values()].sort((a, b) => a.ratio - b.ratio),
    horsJetons: [...horsJetons].sort(),
    encresInverses: [...encresInverses].sort(),
  };
}

/** La clé stable d'un couple, celle sous laquelle une dette se consigne. */
export function cleDuCouple(c: CoupleMesure): string {
  return `${c.fichier} · ${c.encre} sur ${c.fond}`;
}
