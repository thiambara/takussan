import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TCK-467 · **la préférence système « mouvement réduit » vaut pour tout le site.**
 *
 * TCK-464 avait posé un `@media (prefers-reduced-motion: reduce)` borné au parcours de
 * publication, en nommant le manquement plus large plutôt qu'en l'élargissant depuis un ticket
 * sur la publication. Ce fichier garde l'élargissement.
 *
 * ⚠ **Il ne vérifie pas une LISTE, il en DÉRIVE une.** Écrire « ces trois classes sont gardées »
 * serait vert le jour où on l'écrit et muet le jour où quelqu'un ajoute une quatrième animation
 * de déplacement — c'est-à-dire exactement le défaut que ce ticket corrige, reproduit dans son
 * propre test. Le test lit donc `globals.css`, y trouve **toutes** les `@keyframes` qui
 * déplacent (`translate…`), remonte aux classes qui les jouent, et exige que chacune soit
 * neutralisée sous la préférence.
 *
 * ⚠ jsdom n'a pas de moteur CSS : « la carte ne bouge pas » n'y est pas éprouvable. Ce qui l'est,
 * et qui porte l'AC : la règle existe, elle couvre toutes les animations de déplacement, et elle
 * ne vit QUE sous la media query — donc elle ne change rien quand la préférence est absente.
 */

/**
 * ⚠ Les COMMENTAIRES sont retirés avant toute lecture, et ce n'est pas de la coquetterie : la
 * première version de ce fichier rougissait sur sa PROPRE documentation — le commentaire de la
 * règle cite `animation: none` pour expliquer pourquoi on ne s'en contente pas, et le cas AC2
 * l'a compté comme une fuite. *Une garde qui lit du CSS doit lire du CSS, pas de la prose.*
 */
const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Le bloc `{ … }` qui suit `debut`, accolades équilibrées, corps seul (sans les accolades). */
function corps(source: string, debut: number): { corps: string; fin: number } {
  const ouvrante = source.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    else if (source[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return { corps: source.slice(ouvrante + 1, i), fin: i };
    }
  }
  throw new Error(`bloc non refermé à partir de l’octet ${debut}`);
}

/** Les corps de tous les `@media (prefers-reduced-motion: reduce)` du fichier. */
function blocsDeMouvementReduit(): string[] {
  const trouves: string[] = [];
  const motif = /@media\s*\(prefers-reduced-motion:\s*reduce\)/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(CSS)) !== null) {
    const { corps: c, fin } = corps(CSS, m.index);
    trouves.push(c);
    motif.lastIndex = fin;
  }
  return trouves;
}

/** Les noms de `@keyframes` dont au moins une étape DÉPLACE l’élément. */
function animationsQuiDeplacent(): string[] {
  const noms: string[] = [];
  const motif = /@keyframes\s+([A-Za-z][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(CSS)) !== null) {
    const { corps: c, fin } = corps(CSS, m.index);
    if (/transform:\s*translate/.test(c)) noms.push(m[1]);
    motif.lastIndex = fin;
  }
  return noms;
}

/** Les classes qui jouent l’une de ces animations, hors media query. */
function classesQuiDeplacent(): { classe: string; animation: string }[] {
  const deplacent = new Set(animationsQuiDeplacent());
  const trouvees: { classe: string; animation: string }[] = [];
  const motif = /^\.([\w-]+)\s*\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(CSS)) !== null) {
    const animation = /animation:\s*([\w-]+)/.exec(m[2])?.[1];
    if (animation && deplacent.has(animation)) trouvees.push({ classe: m[1], animation });
  }
  return trouvees;
}

const REDUITS = blocsDeMouvementReduit();
const CLASSES = classesQuiDeplacent();

describe('TCK-467 — le mouvement réduit couvre le site', () => {
  it('le recensement DÉRIVÉ trouve bien les animations de déplacement du site', () => {
    // Un test dérivé se trompe en silence si sa dérivation ne trouve rien : ce cas-ci l'empêche.
    // Les trois du ticket sont nommées à cause de ce risque, pas pour figer la liste.
    const noms = animationsQuiDeplacent();
    expect(noms).toEqual(expect.arrayContaining(['fadeInUp', 'cardEnter', 'sectionEnter']));
    expect(CLASSES.map((c) => c.classe)).toEqual(
      expect.arrayContaining(['animate-fade-in-up', 'animate-card-enter', 'animate-section-enter']),
    );
  });

  it('AC1/AC3 · CHAQUE classe qui déplace est neutralisée sous la préférence', () => {
    const nonGardees = CLASSES.filter(
      ({ classe }) => !REDUITS.some(
        (b) => new RegExp(`\\.${classe}\\b`).test(b) && /animation:\s*none/.test(b),
      ),
    );
    expect(
      nonGardees.map((c) => `.${c.classe} (${c.animation})`),
      'une animation de déplacement sans garde `prefers-reduced-motion`',
    ).toEqual([]);
  });

  /**
   * AC3 · TCK-464 gardait quatre classes `.wizard-*`. L'élargissement ne doit pas les absorber ni
   * les redéfinir : une seconde règle sur les mêmes sélecteurs se ferait départager par l'ordre
   * du fichier, ce qui est la façon la plus discrète de défaire une garde.
   */
  it('AC3 · les classes du parcours de publication restent gardées, et une seule fois', () => {
    for (const classe of ['wizard-step-in-forward', 'wizard-step-in-back', 'wizard-field-rise', 'wizard-flash']) {
      const blocs = REDUITS.filter((b) => new RegExp(`\\.${classe}\\b`).test(b));
      expect(blocs, `\`.${classe}\` doit être gardée par exactement un bloc`).toHaveLength(1);
    }
  });

  /**
   * AC2 · quand la préférence est absente, RIEN ne change. La preuve tient en un point : la
   * neutralisation ne vit que sous la media query. Une seule de ces déclarations posée au premier
   * niveau éteindrait l'animation pour tout le monde — et le test « ça ne bouge plus » resterait
   * vert, puisqu'il ne regarde que le cas réduit.
   */
  it('AC2 · aucune neutralisation ne fuit hors de la media query', () => {
    let horsMedia = CSS;
    for (const bloc of REDUITS) horsMedia = horsMedia.replace(bloc, '');
    // La forme la plus directe : hors de la préférence, RIEN n'est neutralisé, quelle que soit
    // la classe. Sans ce cas, déplacer un `animation: none` au premier niveau fait rougir un
    // AUTRE test, par ricochet — et un rouge qui accuse le mauvais coupable se corrige mal.
    expect(horsMedia).not.toMatch(/animation:\s*none/);
    for (const { classe } of CLASSES) {
      const regle = new RegExp(`^\\.${classe}\\s*\\{([^}]*)\\}`, 'm').exec(horsMedia);
      expect(regle, `\`.${classe}\` doit garder sa règle de premier niveau`).not.toBeNull();
      expect(regle?.[1]).not.toMatch(/animation:\s*none/);
      expect(regle?.[1]).toMatch(/animation:\s*[\w-]+\s/);
    }
  });

  /**
   * La DIRECTION UX du ticket, écrite en assertion : « respecter la préférence ne veut pas dire
   * supprimer tout retour visuel ». Un `animation: none` sec fait apparaître les blocs d'un coup ;
   * le parcours de publication avait tranché pour un fondu court, et ce ticket le reconduit.
   */
  it('le retour visuel SUBSISTE — un fondu court, pas une apparition brutale', () => {
    for (const bloc of REDUITS) expect(bloc).toMatch(/transition:\s*opacity\s+\d+ms/);
  });
});
