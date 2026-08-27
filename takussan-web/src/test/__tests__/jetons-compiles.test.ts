/**
 * LES JETONS, TELS QUE TAILWIND LES COMPILE — et non tels qu'on les a recopiés.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CE FICHIER FERME
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/test/contraste-wcag.ts` mesure les contrastes du produit à partir de DEUX TABLES RECOPIÉES
 * À LA MAIN depuis `src/app/globals.css`, et son propre en-tête l'assume : jsdom ne charge aucune
 * feuille, et lire la feuille compilée mesurerait ce que Tailwind a bien voulu émettre plutôt que
 * ce que le design system déclare.
 *
 * Le raisonnement tient, mais il laissait une porte ouverte : **une table recopiée diverge de sa
 * source sans que rien ne le dise.** Elle avait d'ailleurs déjà divergé — son `...JETONS_CLAIR`
 * faisait hériter en silence les valeurs CLAIRES de tout jeton non ré-écrit, si bien qu'une mesure
 * « en sombre » comparait `--primary` clair à un fond sombre : un rapport rassurant, calculé sur
 * une paire qui n'existe nulle part.
 *
 * Ce fichier ne remplace pas les tables — il les CONFRONTE à la compilation réelle. Tailwind lit
 * `globals.css`, résout `@theme inline`, et rend les blocs `:root` et `.dark` ; on compare valeur
 * par valeur. Une couleur changée dans `globals.css` et pas dans la table fait rougir ici, avec
 * les deux valeurs côte à côte.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ET LE SECOND, PLUS COÛTEUX : UN JETON QUI N'EXISTE PAS NE FAIT PAS D'ERREUR
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une classe dont le jeton n'est pas déclaré ne casse RIEN : Tailwind n'émet simplement aucune
 * règle, la couleur disparaît, et ni `tsc`, ni ESLint, ni le build, ni la garde de jetons ne
 * voient quoi que ce soit.
 *
 * **Ce n'est pas une hypothèse : ce fichier est né d'une occurrence réelle.** TCK-440 avait
 * converti les quatre VOILES de la surface publique (`bg-black/<alpha>` → le jeton de voile) alors
 * que ce jeton vit sur une AUTRE branche. Compilation à l'appui, les quatre classes n'émettaient
 * rien : le fond de la lightbox, celui du tiroir de filtres, la surimpression de galerie et la
 * pastille d'horodatage devenaient TRANSPARENTS, sans un signal. La conversion a donc été annulée
 * — une branche doit être cohérente seule — et **différée à l'intégration, où ce test est
 * précisément ce qui la rendra sûre** : il rougit si la classe est écrite avant le jeton.
 *
 * Le contrôle est donc : **toute classe de couleur que la chrome publique écrit réellement doit
 * être ÉMISE par la compilation.** C'est le seul contrôle du dépôt qui puisse attraper un jeton
 * absent — les gardes de jetons, elles, ne savent rien de l'existence des jetons.
 */
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, it, expect, beforeAll } from 'vitest';

import { JETONS_CLAIR, JETONS_SOMBRE } from '@/test/contraste-wcag';

const RACINE = process.cwd();
const GLOBALS = join(RACINE, 'src', 'app', 'globals.css');

/** Les répertoires de la chrome publique — le même périmètre que `scripts/check-public-chrome-tokens.mjs`. */
const PERIMETRE = [
  join(RACINE, 'src', 'app', '[locale]', '(public)'),
  join(RACINE, 'src', 'components', 'home'),
  join(RACINE, 'src', 'components', 'property'),
  join(RACINE, 'src', 'components', 'search'),
  join(RACINE, 'src', 'components', 'compare'),
  join(RACINE, 'src', 'components', 'favorites'),
];

/**
 * Les deux SEULS jetons que les tables ne peuvent pas reproduire à l'identique, et pourquoi.
 *
 * `.dark` les écrit en blanc translucide (`oklch(1 0 0 / 10%)` et `/ 15%`), que `versRvb()` ne
 * sait pas lire. `contraste-wcag.ts` en porte la composition sur `--background`, ce qui est une
 * APPROXIMATION assumée et documentée sur place. Les exclure ici est le seul geste honnête : les
 * comparer ferait rougir sur une différence qu'on a choisie.
 */
const APPROXIMES_EN_SOMBRE = new Set(['border', 'input']);


function fichiersDe(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === '__tests__') continue;
      fichiersDe(chemin, acc);
    } else if (/\.(tsx?|jsx?)$/.test(entree) && !/\.(test|spec)\./.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

/** Les classes de couleur RÉELLEMENT écrites par la chrome publique. */
function classesDeCouleurDuPerimetre(): string[] {
  const MOTIF = /\b(?:[a-z-]+(?::[a-z0-9[\]=_-]+)*:)?(?:bg|text|border|ring)-[a-z][a-z0-9/.-]*/g;
  const vues = new Set<string>();
  for (const dir of PERIMETRE) {
    for (const fichier of fichiersDe(dir)) {
      for (const classe of readFileSync(fichier, 'utf8').match(MOTIF) ?? []) {
        // On ne garde que celles dont le radical est un JETON du design system : `text-sm`,
        // `bg-cover` et `border-2` ne sont pas des couleurs et n'ont rien à être émis.
        const radical = classe.replace(/^.*:/, '').replace(/^(?:bg|text|border|ring)-/, '').split('/')[0]!;
        if (radical in JETONS_CLAIR) vues.add(classe.replace(/^.*:/, ''));
      }
    }
  }
  return [...vues].sort();
}

let compile = '';

beforeAll(async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'takussan-tw-'));
  const contenu = join(dossier, 'contenu.html');
  writeFileSync(
    contenu,
    classesDeCouleurDuPerimetre().map((c) => `<i class="${c}"></i>`).join('\n'),
  );

  // `source(none)` + un `@source` explicite : sans ça Tailwind balaie tout le dépôt, ce qui rend
  // le test lent ET dépendant de fichiers qui ne sont pas son objet.
  const css = [
    '@import "tailwindcss" source(none);',
    `@source "${contenu}";`,
    readFileSync(GLOBALS, 'utf8')
      .split('\n')
      .filter((l) => !/^@import\s+"tailwindcss"/.test(l))
      .join('\n'),
  ].join('\n');

  compile = (await postcss([tailwind()]).process(css, { from: GLOBALS })).css;
}, 60_000);

/** Les déclarations `--x: valeur` d'un sélecteur donné, dans la feuille compilée. */
function jetonsDe(selecteur: string): Record<string, string> {
  const debut = compile.indexOf(`\n${selecteur} {`);
  expect(debut, `bloc « ${selecteur} » absent de la feuille compilée`).toBeGreaterThan(-1);
  const bloc = compile.slice(debut, compile.indexOf('\n}', debut));
  const table: Record<string, string> = {};
  for (const [, nom, valeur] of bloc.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gm)) {
    table[nom!] = valeur!.trim();
  }
  return table;
}

describe('jetons du design system, confrontés à la compilation Tailwind', () => {
  it('la compilation a bien eu lieu — sinon tout le reste est vert pour rien', () => {
    expect(compile.length).toBeGreaterThan(5_000);
    expect(compile).toContain('@layer utilities');
  });

  it.each([
    ['clair', ':root', () => JETONS_CLAIR, new Set<string>()],
    ['sombre', '.dark', () => JETONS_SOMBRE, APPROXIMES_EN_SOMBRE],
  ])('thème %s : la table recopiée dit la même chose que %s', (_nom, selecteur, table, exclus) => {
    const compiles = jetonsDe(selecteur);
    const ecarts: string[] = [];
    for (const [jeton, valeur] of Object.entries(table())) {
      if (exclus.has(jeton)) continue;
      const attendu = compiles[jeton];
      // Un jeton de la table absent du bloc `.dark` n'est pas un écart : il n'y est pas
      // redéfini, donc il garde sa valeur claire — ce que le `...JETONS_CLAIR` reproduit.
      if (attendu === undefined) continue;
      // `#fff` et `#ffffff` sont la même couleur : on compare la COULEUR, pas le texte.
      const normalise = (h: string) =>
        /^#[0-9a-f]{3}$/i.test(h) ? `#${[...h.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : h.toLowerCase();
      if (normalise(attendu) !== normalise(valeur)) {
        ecarts.push(`--${jeton} : globals.css dit ${attendu}, la table dit ${valeur}`);
      }
    }
    expect(ecarts, 'la table de contraste a divergé de globals.css').toEqual([]);
  });

  it("AC3 — le blanc figé et les jetons de surface rendent EXACTEMENT la même couleur", () => {
    // La moitié de la conversion de TCK-440 est une équivalence stricte : le blanc figé de la
    // navbar, du pied de page et de la barre latérale devient `--card` ou `--popover`. Prouvé
    // par COMPILATION et non par une table : c'est la seule forme de preuve qui survive à un
    // changement de `globals.css`.
    const racine = jetonsDe(':root');
    const blanc = (compile.match(/--color-white:\s*([^;]+);/) ?? [])[1]?.trim();
    expect(blanc, '--color-white absent de la feuille compilée').toBeDefined();
    const normalise = (h: string) =>
      /^#[0-9a-f]{3}$/i.test(h) ? `#${[...h.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : h.toLowerCase();
    expect(normalise(racine.card!)).toBe(normalise(blanc!));
    expect(normalise(racine.popover!)).toBe(normalise(blanc!));
  });

  it("toute classe de couleur écrite par la chrome publique est ÉMISE par la compilation", () => {
    // ⚠ LE contrôle qui manquait. Une classe dont le jeton n'est pas déclaré ne produit AUCUNE
    // règle et AUCUNE erreur : le voile devient transparent, en silence. C'est exactement ce qui
    // est arrivé aux quatre `bg-scrim/*` de la surface publique, écrits avant que `--scrim`
    // n'existe sur cette branche.
    const classes = classesDeCouleurDuPerimetre();
    expect(classes.length, 'aucune classe relevée — le relevé est cassé, pas la chrome').toBeGreaterThan(10);

    // ⚠ Tailwind ÉCHAPPE `/` et `.` dans le sélecteur émis (`.bg-scrim\\/40 {`), et les
    // utilitaires sont INDENTÉS dans `@layer utilities`. Une recherche par expression régulière
    // ancrée en début de ligne rend « tout est absent » — un rouge qui accuse la chrome alors
    // que c'est le relevé qui est faux. On cherche donc le sélecteur littéral.
    const absentes = classes.filter(
      (classe) => !compile.includes(`.${classe.replace(/([/.])/g, '\\$1')} {`),
    );

    expect(
      absentes,
      "classe(s) écrite(s) par la chrome mais qu'aucune règle CSS ne définit — jeton absent de globals.css",
    ).toEqual([]);
  });
});
