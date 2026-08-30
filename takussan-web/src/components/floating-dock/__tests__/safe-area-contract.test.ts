/**
 * TCK-477 — LA MOITIÉ QUE LE TYPE NE PEUT PAS TENIR.
 *
 * `FloatingDockSlotConfig` (voir `../types.ts`) refuse à la compilation un slot
 * `bottom-full` qui ne DÉCLARE pas son encart de zone sûre. Aucun type ne peut en
 * revanche exiger que la valeur déclarée ATTEIGNE le DOM : `tsc` ne sait pas si un
 * `paddingBottom` rendu par le hook est posé sur un élément ou jeté.
 *
 * C'est exactement l'écart qui a produit le défaut d'origine : la barre déclarait
 * l'intention (`safe-area-bottom` dans son `className`) et n'appliquait rien, cette
 * classe n'ayant jamais existé (TCK-453). *Un commentaire n'est pas une garde ; une
 * déclaration non consommée non plus.*
 *
 * Ce contrôle est donc STATIQUE — il lit les sources, il ne rend rien : tout
 * consommateur qui revendique `corner: 'bottom-full'` doit relire `paddingBottom`
 * ailleurs que dans l'appel lui-même.
 *
 * ## Pourquoi ici et pas dans `scripts/check-*.mjs`
 *
 * Les gardes de `scripts/` sont énumérées une à une dans `repo-ci.yml`. Une garde
 * livrée sans son étape de CI est une garde qui ne tourne pas — et « un contrôle vert
 * qu'on ne rejoue pas est un contrôle qui n'existe pas » (TCK-453, AC5). Vitest est
 * déjà rejoué par `web-ci.yml` à chaque PR touchant `takussan-web/**` : ce fichier est
 * gardé du premier jour, sans dépendre d'un câblage à poser ailleurs.
 *
 * ## Ce qu'il NE voit PAS — déclaré, pas oublié
 *
 * - un appel dont la configuration est masquée derrière une variable : le corner n'est
 *   plus lisible statiquement. Ce cas n'est pas ignoré en silence, il est REFUSÉ
 *   (cran n°3 ci-dessous) — une mesure absente n'est pas une mesure verte ;
 * - un consommateur qui relit `paddingBottom` puis ne s'en sert pas (`void
 *   paddingBottom`). ESLint attrape la forme la plus probable (variable déstructurée
 *   inutilisée) ; la forme volontaire échappe aux deux. Trou assumé : la garde
 *   demande le geste, elle ne peut pas juger de l'intention ;
 * - une apostrophe de TEXTE JSX (`l'encart`) ouvre pour `blanchit()` une chaîne qui ne
 *   se referme pas là où le lecteur le croit. C'est une imprécision ASSUMÉE, et sa
 *   direction est ce qui la rend tolérable : le blanchiment ne fait qu'EFFACER, jamais
 *   ajouter — il peut donc produire un faux ROUGE, jamais un faux vert. Une garde qui
 *   se trompe bruyamment se corrige ; c'est le silence qui a coûté ce ticket.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(__dirname, '../../..'); // → takussan-web/src
const MODULE_DOCK = path.join(RACINE, 'components/floating-dock');

/** Nombre de sites d'appel relevés le 2026-08-30, par coin. Plancher, jamais plafond. */
const PLANCHER = {
  'bottom-full': 1, // PropertyMobileBottomBar
  'bottom-right': 3, // ChatWidget (bureau + mobile) et CompareFloatingBar
} as const;

type Site = {
  fichier: string;
  ligne: number;
  corner: string | null;
  /** Texte de l'objet de configuration, accolades comprises. */
  appel: string;
};

function fichiersSource(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const complet = path.join(dossier, entree);
    if (statSync(complet).isDirectory()) {
      if (entree === '__tests__' || entree === 'node_modules') continue;
      trouves.push(...fichiersSource(complet));
      continue;
    }
    if (!/\.tsx?$/.test(entree)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entree)) continue;
    trouves.push(complet);
  }
  return trouves;
}

/**
 * Blanchit commentaires et littéraux de chaîne, en préservant les longueurs et les
 * retours à la ligne (les décalages et les numéros de ligne restent justes).
 *
 * ⚠ **Cette fonction n'est pas une précaution, elle a été écrite APRÈS une ablation
 * ROUGE.** La première version du cran n°2 cherchait `paddingBottom` dans le texte
 * brut : elle passait au vert sur une barre dont l'encart avait été retiré, parce que
 * le mot survivait dans un COMMENTAIRE de cette même barre. Une garde satisfaite par
 * un commentaire est très exactement le défaut que TCK-477 corrige — au troisième
 * exemplaire après les deux de TCK-453. Elle est donc gardée par la famille de cas
 * `PIÈGES` ci-dessous.
 */
function blanchit(source: string): string {
  const sortie = source.split('');
  let i = 0;
  const efface = (jusqu: number) => {
    for (let k = i; k < jusqu && k < sortie.length; k += 1) {
      if (sortie[k] !== '\n') sortie[k] = ' ';
    }
  };
  while (i < source.length) {
    const deux = source.slice(i, i + 2);
    if (deux === '//') {
      const fin = source.indexOf('\n', i);
      const jusqu = fin === -1 ? source.length : fin;
      efface(jusqu);
      i = jusqu;
    } else if (deux === '/*') {
      const fin = source.indexOf('*/', i + 2);
      const jusqu = fin === -1 ? source.length : fin + 2;
      efface(jusqu);
      i = jusqu;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const guillemet = source[i];
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') j += 2;
        else if (source[j] === guillemet) break;
        else j += 1;
      }
      const jusqu = Math.min(j + 1, source.length);
      i += 1; // on garde les guillemets : ils bornent, ils ne portent rien
      efface(jusqu - 1);
      i = jusqu;
    } else {
      i += 1;
    }
  }
  return sortie.join('');
}

/**
 * Découpe l'argument d'un appel par équilibrage d'accolades, plutôt que par une
 * expression rationnelle : un objet de configuration contient des accolades imbriquées
 * (`style={{ … }}`, gabarits) et une regex y mordrait au milieu — le défaut mesuré
 * d'extracteur de TCK-453, qu'on ne rejoue pas.
 */
function litArgument(source: string, depuis: number): string | null {
  let i = depuis;
  while (i < source.length && source[i] !== '(') i += 1;
  if (i === source.length) return null;
  let profondeur = 0;
  const debut = i;
  for (; i < source.length; i += 1) {
    const c = source[i];
    if (c === '(' || c === '{' || c === '[') profondeur += 1;
    else if (c === ')' || c === '}' || c === ']') {
      profondeur -= 1;
      if (profondeur === 0) return source.slice(debut, i + 1);
    }
  }
  return null;
}

function relevé(): Site[] {
  const sites: Site[] = [];
  for (const fichier of fichiersSource(RACINE)) {
    if (fichier.startsWith(MODULE_DOCK + path.sep)) continue; // l'orchestrateur lui-même
    const source = readFileSync(fichier, 'utf8');
    // Le relevé des appels se fait sur le texte brut (on a besoin de la valeur du
    // `corner`, qui EST un littéral) ; c'est le cran n°2 qui lit la source blanchie.
    let depuis = 0;
    for (;;) {
      const trouve = source.indexOf('useFloatingDockSlot(', depuis);
      if (trouve === -1) break;
      depuis = trouve + 1;
      const appel = litArgument(source, trouve + 'useFloatingDockSlot'.length);
      if (appel === null) continue;
      const corner = /corner\s*:\s*'([^']+)'/.exec(appel)?.[1] ?? null;
      sites.push({
        fichier: path.relative(RACINE, fichier),
        ligne: source.slice(0, trouve).split('\n').length,
        corner,
        appel,
      });
    }
  }
  return sites;
}

const SITES = relevé();

describe('TCK-477 — tout slot `bottom-full` fait parvenir son encart de zone sûre au DOM', () => {
  // Cran n°1 — la garde a-t-elle regardé quelque chose ? Un relevé vide passerait tous
  // les contrôles ci-dessous « par construction », qui est le défaut exact que TCK-453
  // a payé sur sa première version. Le plancher rend ce vert-là impossible.
  it('relève au moins autant de sites qu\'au 2026-08-30 (le relevé n\'est pas vide)', () => {
    const parCoin = (coin: string) => SITES.filter((s) => s.corner === coin);
    expect(parCoin('bottom-full').length).toBeGreaterThanOrEqual(PLANCHER['bottom-full']);
    expect(parCoin('bottom-right').length).toBeGreaterThanOrEqual(PLANCHER['bottom-right']);
  });

  // Cran n°2 — AC1/AC3. Le message NOMME le fichier et la ligne : « un encart a
  // disparu » sans dire où ne vaut pas mieux que le silence.
  it('chaque consommateur `bottom-full` relit `paddingBottom` hors de son appel', () => {
    const manquants: string[] = [];
    for (const site of SITES) {
      if (site.corner !== 'bottom-full') continue;
      const source = readFileSync(path.join(RACINE, site.fichier), 'utf8');
      // Hors de l'appel : déclarer l'encart ne suffit pas, il faut le consommer.
      // Et sur la source BLANCHIE : un `paddingBottom` écrit dans un commentaire est
      // du texte, pas un geste (cf. l'en-tête de `blanchit`).
      const horsAppel = blanchit(source).split(blanchit(site.appel)).join('');
      if (!horsAppel.includes('paddingBottom')) {
        manquants.push(
          `${site.fichier}:${site.ligne} — slot \`bottom-full\` sans encart de zone sûre appliqué : ` +
            'le `paddingBottom` rendu par `useFloatingDockSlot` n\'est posé nulle part ' +
            '(attendu : `style={{ bottom, paddingBottom }}`). TCK-477.',
        );
      }
    }
    expect(manquants, manquants.join('\n')).toEqual([]);
  });

  // Cran n°3 — AC2. Le témoin légitime est COMPTÉ, et il passe : aucun `bottom-right`
  // ne peut apparaître dans la liste du cran n°2, puisque le contrôle ne le regarde
  // pas. On l'affirme ici plutôt que de le supposer.
  it('n\'exige rien d\'un slot `bottom-right`, et refuse un appel illisible', () => {
    const temoins = SITES.filter((s) => s.corner === 'bottom-right');
    expect(temoins.length).toBeGreaterThanOrEqual(PLANCHER['bottom-right']);
    for (const temoin of temoins) {
      expect(
        temoin.appel.includes('safeAreaInset'),
        `${temoin.fichier}:${temoin.ligne} — un slot \`bottom-right\` ne doit pas porter d'encart.`,
      ).toBe(false);
    }

    // Un appel dont le corner n'est pas lisible échappe au cran n°2 : on le refuse au
    // lieu de le sauter. Une mesure absente n'est pas une mesure verte.
    const illisibles = SITES.filter((s) => s.corner === null).map(
      (s) => `${s.fichier}:${s.ligne} — corner non littéral : la garde TCK-477 ne peut pas juger.`,
    );
    expect(illisibles, illisibles.join('\n')).toEqual([]);
  });

  // Cran n°4 — auto-épreuve du blanchiment. Sans lui, le cran n°2 est satisfait par un
  // commentaire : c'est l'ablation qui l'a montré, pas une supposition. Chaque cas est
  // un endroit où le mot apparaît SANS être un geste.
  it('ne prend pas un `paddingBottom` de commentaire ou de chaîne pour un geste', () => {
    const PIEGES = [
      ['commentaire de ligne', '// le hook rend paddingBottom\nconst a = 1;'],
      ['commentaire de bloc', '/** rend `paddingBottom` */\nconst a = 1;'],
      ['docblock multiligne', '/*\n * paddingBottom\n */\nconst a = 1;'],
      ['chaîne simple', "const a = 'paddingBottom';"],
      ['chaîne double', 'const a = "paddingBottom";'],
      ['gabarit', 'const a = `paddingBottom`;'],
    ] as const;
    // Plancher égal au compte réel : retirer un seul cas fait rougir (patron TCK-453).
    expect(PIEGES.length).toBe(6);
    for (const [nom, code] of PIEGES) {
      expect(blanchit(code).includes('paddingBottom'), `${nom} : non blanchi`).toBe(false);
    }
    // Et le témoin inverse : un vrai geste survit au blanchiment.
    expect(blanchit('<div style={{ bottom, paddingBottom }} />')).toContain('paddingBottom');
    // Le blanchiment ne décale rien : longueurs et lignes conservées.
    const echantillon = "// x\nconst a = 'y';\n/* z */\n";
    expect(blanchit(echantillon)).toHaveLength(echantillon.length);
    expect(blanchit(echantillon).split('\n')).toHaveLength(echantillon.split('\n').length);
  });
});
