import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ESPACEMENTS_DE_LETTRES,
  OMBRES,
  POINTS_DE_RUPTURE,
  TAILLES_DE_TEXTE,
  TAILLES_FIXES,
} from '@/lib/jetons-de-l-app';

/**
 * TCK-2685 (ADR-0106 § 3, ADR-0107 § 4) — les jetons de la partie connectée, lus dans
 * `globals.css` et dans la feuille que compile le Tailwind du dépôt.
 *
 * jsdom n'évalue ni les requêtes média ni `:has()` : la taille réellement calculée (13 px à 390 ET à
 * 1440, 16,25 px sous une police navigateur de 20 px), le trait des icônes et la portée dans un
 * portail sont mesurés au navigateur sur la vitrine (notes du ticket). Ce test garde la SOURCE de
 * ces rendus : une valeur, une place hors de l'échelle ×0,9, une règle émise.
 */
const RACINE = process.cwd();
const GLOBALS = join(RACINE, 'src', 'app', 'globals.css');
const css = readFileSync(GLOBALS, 'utf8');
const theme = readFileSync(join(RACINE, 'node_modules/tailwindcss/theme.css'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = css.indexOf(debut);
  const j = css.indexOf(fin);
  expect(i, `marqueur « ${debut} » absent de globals.css`).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return css.slice(i, j);
}
const BLOC_APP = bloc('/* jetons-de-l-app:début', '/* jetons-de-l-app:fin */');
const BLOC_DENSITE = bloc('/* densite-du-bureau:début', '/* densite-du-bureau:fin */');

/** Les déclarations `--x: valeur;` du `@theme { … }` du bloc de l'app. */
function declarations(prefixe: string): Map<string, string> {
  const t = BLOC_APP.match(/@theme \{([\s\S]*?)\n\}/);
  expect(t, '`@theme { … }` absent du bloc jetons-de-l-app').not.toBeNull();
  return new Map(
    [...t![1].matchAll(new RegExp(`(--${prefixe}-[\\w-]+)\\s*:\\s*([^;]+);`, 'g'))].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const T = 'text';
const classes = [
  ...Object.keys(TAILLES_DE_TEXTE).map((n) => `${T}-${n}`),
  ...ESPACEMENTS_DE_LETTRES.map((n) => `tracking-${n}`),
  ...TAILLES_FIXES.map((n) => `size-${n}`),
  ...OMBRES.map((n) => `shadow-${n}`),
  ...POINTS_DE_RUPTURE.map((n) => `${n}:flex`),
  '2xl:flex',
  'portee-app:flex',
  `${T}-encre-douce`,
  `${T}-encre-douce-inverse`,
];

let compile = '';
beforeAll(async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'takussan-tw-app-'));
  const contenu = join(dossier, 'contenu.html');
  writeFileSync(contenu, classes.map((c) => `<i class="${c}"></i>`).join('\n'));
  const source = [
    '@import "tailwindcss" source(none);',
    `@source "${contenu}";`,
    css.split('\n').filter((l) => !/^@import\s+"tailwindcss"/.test(l)).join('\n'),
  ].join('\n');
  compile = (await postcss([tailwind()]).process(source, { from: GLOBALS })).css;
}, 60_000);

/** La règle compilée d'une classe (premier bloc `{ … }` qui suit son sélecteur échappé). */
function regle(classe: string): string {
  const sel = `.${classe.replace(/[:]/g, '\\:').replace(/^(\d)/, '\\3$1 ')} {`;
  const i = compile.indexOf(sel);
  expect(i, `aucune règle émise pour « ${classe} »`).toBeGreaterThan(-1);
  let profondeur = 0;
  for (let k = i + sel.length - 1; k < compile.length; k++) {
    if (compile[k] === '{') profondeur++;
    if (compile[k] === '}' && --profondeur === 0) return compile.slice(i, k + 1);
  }
  throw new Error(`règle de « ${classe} » non refermée`);
}

describe('TCK-2685 — la table des noms et le bloc de globals.css disent la même chose', () => {
  it.each([
    ['text', Object.keys(TAILLES_DE_TEXTE)],
    ['tracking', [...ESPACEMENTS_DE_LETTRES]],
    ['spacing', [...TAILLES_FIXES]],
    ['shadow', [...OMBRES]],
    ['breakpoint', [...POINTS_DE_RUPTURE]],
  ])('--%s-* : déclarés = nommés (tailwind-merge les connaît)', (prefixe, noms) => {
    const declares = [...declarations(prefixe).keys()].map((k) => k.slice(prefixe.length + 3)).sort();
    expect(declares).toEqual([...noms].sort());
  });
});

describe('TCK-2685 — l’échelle de texte, en rem calculés, hors de l’échelle ×0,9', () => {
  const tailles = declarations('text');

  it.each(Object.entries(TAILLES_DE_TEXTE))('--text-%s vaut %s px en rem (÷ 16)', (nom, px) => {
    const v = tailles.get(`--text-${nom}`);
    expect(v, `--text-${nom} absent`).toMatch(/^[\d.]+rem$/);
    expect(Number(v!.slice(0, -3)) * 16).toBeCloseTo(px, 6);
  });

  it('aucun jeton de l’app n’est redéfini par le bloc de densité du bureau (il suivrait le ×0,9)', () => {
    const noms = [...tailles.keys(), '--spacing-icone', ...ESPACEMENTS_DE_LETTRES.map((n) => `--tracking-${n}`)];
    for (const nom of noms) expect(BLOC_DENSITE, `${nom} dans le bloc de densité`).not.toContain(`${nom}:`);
  });

  it('aucun interligne propre : le texte hérite celui du parent, comme `text-[13px]` (AC2)', () => {
    expect([...BLOC_APP.matchAll(/--text-[\w-]+--line-height/g)]).toEqual([]);
    for (const nom of Object.keys(TAILLES_DE_TEXTE)) {
      const r = regle(`${T}-${nom}`);
      expect(r).toContain(`font-size: var(--text-${nom})`);
      expect(r, `${T}-${nom} pose un interligne`).not.toMatch(/line-height/);
    }
  });

  it('aucun nom ne masque une taille du thème de Tailwind (le site public ne bouge pas)', () => {
    for (const nom of Object.keys(TAILLES_DE_TEXTE)) expect(theme).not.toMatch(new RegExp(`--text-${nom}\\s*:`));
  });
});

describe('TCK-2685 — espacement des lettres, icône, ombres', () => {
  it('tracking : titre −0,02 em, sur-titre 0,08 em ; `tracking-tight` n’est pas redéfini', () => {
    const t = declarations('tracking');
    expect(t.get('--tracking-titre')).toBe('-0.02em');
    expect(t.get('--tracking-surtitre')).toBe('0.08em');
    expect(css).not.toMatch(/--tracking-tight\s*:/);
  });

  it('`size-icone` : 1,125rem (18 px), lu par `var()`', () => {
    expect(declarations('spacing').get('--spacing-icone')).toBe('1.125rem');
    expect(regle('size-icone')).toContain('width: var(--spacing-icone)');
  });

  it('chaque ombre nommée compose `--shadow-color` en `in srgb` ; la feuille garde la valeur de `shadow-2xl`', () => {
    const ombres = declarations('shadow');
    const deuxXl = theme.match(/--shadow-2xl:\s*([^;]+);/)![1]!.trim();
    // TCK-2741 — trois ombres du comparateur flottant sortent de la règle, chacune à la valeur EXACTE
    // qu'elle a remplacée (rendu identique, relevé avant/après) : la pastille sombre composée en
    // `in oklab`, et le contour intérieur de vignette, sur `--scrim` en clair et `--foreground` en sombre.
    const HORS_REGLE: Record<string, string> = {
      '--shadow-pastille-flottante': '0 8px 20px -8px color-mix(in oklab, var(--shadow-color) 55%, transparent)',
      '--shadow-contour-vignette': 'inset 0 0 0 1px color-mix(in srgb, var(--scrim) 12%, transparent)',
      '--shadow-contour-vignette-sombre': 'inset 0 0 0 1px color-mix(in srgb, var(--foreground) 14%, transparent)',
    };
    for (const [nom, valeur] of ombres) {
      if (nom === '--shadow-feuille') expect(valeur).toBe(deuxXl);
      else if (nom in HORS_REGLE) expect(valeur, nom).toBe(HORS_REGLE[nom]);
      // Une ombre à plusieurs couches (TCK-2587, `carte-levee`) : chaque couche suit la même règle.
      else for (const couche of valeur.split(/(?<=\)),\s*/)) expect(couche, nom).toMatch(/^[-\d\s.px]+color-mix\(in srgb, var\(--shadow-color\) \d+%, transparent\)$/);
    }
    // TCK-2587 — la carte « prochaine visite » : les deux couches de `OMBRE` de la maquette.
    expect(ombres.get('--shadow-carte-levee')).toBe(
      '0 1px 2px color-mix(in srgb, var(--shadow-color) 5%, transparent), 0 12px 24px -16px color-mix(in srgb, var(--shadow-color) 20%, transparent)',
    );
    expect(ombres.get('--shadow-barre-collante')).toContain('0 -6px 16px -12px');
    expect(ombres.get('--shadow-barre-collante')).toContain(' 40%');
    expect(ombres.get('--shadow-panneau')).toContain('-24px 0 48px -32px');
    // TCK-2621 — la carte de « Choisir un espace » au bureau : la valeur exacte de la maquette.
    expect(ombres.get('--shadow-carte-d-entree')).toBe('0 24px 60px -28px color-mix(in srgb, var(--shadow-color) 45%, transparent)');
    // TCK-2741 — la barre flottante et la pastille de retrait : les valeurs exactes remplacées.
    expect(ombres.get('--shadow-barre-flottante')).toBe(
      '0 1px 2px color-mix(in srgb, var(--shadow-color) 6%, transparent), 0 12px 32px color-mix(in srgb, var(--shadow-color) 14%, transparent)',
    );
    expect(ombres.get('--shadow-pastille-retrait')).toBe('0 1px 3px color-mix(in srgb, var(--shadow-color) 28%, transparent)');
    for (const nom of OMBRES) expect(regle(`shadow-${nom}`)).toContain('box-shadow');
  });

  it('les ombres existantes ne sont pas redéfinies', () => {
    expect(css).not.toMatch(/--shadow-(2xs|xs|sm|md|lg|xl|2xl)\s*:/);
  });
});

describe('TCK-2685 — le point de rupture de la bande ≥ 1440 (AC-BP)', () => {
  it('`w1440:` est une requête média à 90rem ; `2xl:` garde 96rem', () => {
    expect(declarations('breakpoint').get('--breakpoint-w1440')).toBe('90rem');
    expect(regle('w1440:flex')).toContain('@media (width >= 90rem)');
    expect(regle('2xl:flex')).toContain('@media (width >= 96rem)');
    expect(css).not.toMatch(/--breakpoint-2xl\s*:/);
  });
});

describe('TCK-2685 — la portée `/app`', () => {
  it('la variante `portee-app:` se lit sur `:root:has([data-portee-app])` — elle atteint les portails', () => {
    expect(compile).toMatch(/\.portee-app\\:flex \{\s*&:where\(:root:has\(\[data-portee-app\]\) \*\)/);
  });

  it('la coque de `/app` pose le marqueur', () => {
    expect(readFileSync(join(RACINE, 'src/components/layout/AppShell.tsx'), 'utf8')).toMatch(/data-portee-app=""/);
  });

  it('trait par défaut des icônes lucide sous la portée : 1,75 puis 1,5 dès `md`, en couche `base`', () => {
    const base = BLOC_APP.slice(BLOC_APP.indexOf('@layer base {'));
    expect(base.length, '`@layer base` absent du bloc').toBeGreaterThan(20);
    const sel = ':root:has([data-portee-app]) svg.lucide[stroke-width="2"]';
    const [telephone, bureau] = base.split('@media (width >= 48rem)');
    expect(telephone).toContain(`${sel} {\n    stroke-width: 1.75;`);
    expect(bureau).toContain(`${sel} {\n      stroke-width: 1.5;`);
  });

  it('les encres douces émettent une couleur', () => {
    expect(regle(`${T}-encre-douce`)).toContain('color: var(--encre-douce);');
    expect(regle(`${T}-encre-douce-inverse`)).toContain('color: var(--encre-douce-inverse);');
  });
});
