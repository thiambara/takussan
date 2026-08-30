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
 * CE QUE CE FICHIER A PROMIS ET N'A JAMAIS SU FAIRE — retiré le 2026-08-27
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il portait un quatrième contrôle, « toute classe de couleur écrite par la chrome est ÉMISE par
 * la compilation », présenté comme *le seul mécanisme du dépôt capable de voir un jeton absent*.
 * **Il ne pouvait rien voir du tout, et il a été supprimé plutôt que désactivé** — un cas mis en
 * sommeil est une invitation à le réactiver sans le corriger.
 *
 * Le défaut, relevé par la revue adverse : le relevé des classes était filtré sur
 * `radical in JETONS_CLAIR`. Une classe dont le jeton n'existe PAS était donc écartée **avant**
 * d'être contrôlée — c'est-à-dire exactement le cas que le contrôle prétendait attraper.
 * L'ensemble des manquantes était vide par construction, jamais par mesure.
 *
 * Et d'un cran plus loin : ce même relevé filtré alimente encore aujourd'hui {@link contenuCompile}
 * ci-dessous. La classe écartée n'était donc ni dans la liste contrôlée, ni dans la feuille où on
 * la cherchait — **la boucle était fermée aux deux bouts par la même liste.**
 *
 * ⚠ Ce qui rend le cas exemplaire, et pourquoi il ne faut pas le réécrire à l'identique : sa
 * première version portait une exception nommée pour le jeton qu'on cherchait. Elle a bel et bien
 * rougi sur les quatre voiles concernés — **parce qu'on lui avait soufflé le nom.** Une garde qui
 * ne connaît que la liste des valeurs valides et écarte le reste ne garde rien : *« le reste » est
 * précisément le défaut.*
 *
 * La forme correcte est plus SIMPLE que la fausse — aucune liste, le compilateur arbitre.
 *
 * ⚠ **ELLE EXISTE DEPUIS TCK-453, ET ELLE NE VIT PAS ICI :** `scripts/check-classes-emises.mjs`,
 * branchée dans `web-ci.yml` (`npm run check:classes-emises`), avec son relevé dans
 * `scripts/classes-ecrites.mjs`. Elle soumet chaque classe écrite dans `src/` à Tailwind par un
 * `@source inline()` et rougit en nommant la classe ET son fichier. Ligne de base mesurée le
 * 2026-08-29 sur TOUT `src/` : 923 fichiers, 1 533 classes distinctes, **0 faux positif**.
 *
 * Elle est en `.mjs` et non en test vitest parce qu'elle lit tout `src/` et compile : c'est une
 * garde de CI, pas un test unitaire — et parce qu'elle porte son propre corpus d'épreuve, ses
 * planchers et ses ablations, que le harnais de vitest ne lui apporterait pas.
 *
 * **Ne rien réintroduire ici** : deux contrôles du même objet dans deux fichiers divergent, et
 * c'est le second qui ment.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FAIT, LUI, ET QUI TIENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trois contrôles, tous portant sur des VALEURS lues dans la feuille réellement compilée : les
 * deux tables de `contraste-wcag.ts` confrontées à `:root` et à `.dark`, et l'identité de valeur
 * entre le blanc figé et les jetons de surface. Aucun ne dépend du relevé de classes.
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
 * Les SEULS jetons que les tables ne peuvent pas reproduire à l'identique, et pourquoi.
 *
 * `.dark` les écrit en blanc translucide (`oklch(1 0 0 / 10%)` et `/ 15%`), que `versRvb()` ne
 * sait pas lire. `contraste-wcag.ts` en porte la composition sur `--background`, ce qui est une
 * APPROXIMATION assumée et documentée sur place. Les exclure ici est le seul geste honnête : les
 * comparer ferait rougir sur une différence qu'on a choisie.
 *
 * ⚠ `sidebar-border` a rejoint les deux autres le 2026-08-29 (TCK-458), quand les 21 jetons du DS
 * qui manquaient à `contraste-wcag.ts` y sont entrés. Le laisser DEHORS de la table n'était pas
 * l'option prudente : il aurait alors hérité de sa valeur CLAIRE par le `...JETONS_CLAIR`, soit
 * une bordure crème mesurée sur un fond sombre — le piège que l'en-tête de `JETONS_SOMBRE`
 * raconte, exactement. Une approximation déclarée vaut mieux qu'un héritage silencieux.
 *
 * ⚠ `--destructive`, lui, n'est PAS dans les tables : il est en `oklch(…)` dans les DEUX blocs, et
 * l'approximer demanderait une conversion OKLCH → sRGB que rien ne vérifierait. Il reste « hors
 * jetons », donc compté et non mesuré. Il n'a rien à faire ici : ce jeu-ci ne liste que ce qui EST
 * dans la table et diffère volontairement de la feuille.
 */
const APPROXIMES_EN_SOMBRE = new Set(['border', 'input', 'sidebar-border']);


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

/**
 * Un ÉCHANTILLON de classes réelles, servant uniquement à donner du contenu à compiler.
 *
 * ⚠ **Ce n'est pas une garde et ça ne peut pas en être une** : le filtre `radical in JETONS_CLAIR`
 * ci-dessous écarte par construction toute classe dont le jeton n'existe pas. C'est acceptable ICI
 * — on veut seulement que Tailwind ait des utilitaires à émettre — et c'était le défaut fatal du
 * contrôle retiré (cf. l'en-tête, et TCK-453). Ne pas rebâtir un contrôle sur cette fonction.
 */
function contenuCompile(): string[] {
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
    contenuCompile().map((c) => `<i class="${c}"></i>`).join('\n'),
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

});
