import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { beforeAll, describe, expect, it } from 'vitest';

import { FIELD_DENSITY_HEIGHT, FIELD_DENSITY_HEIGHT_SIZED } from '@/components/ui/field-density';
import { DENSITE_DE_L_APP } from '@/lib/jetons-de-l-app';

/**
 * TCK-2686 (ADR-0106 § 2, amende TCK-2460) — L'ÉCHELLE DE DENSITÉ DE `/app`, lue dans `globals.css`
 * et dans la feuille que compile le Tailwind du dépôt.
 *
 * La mécanique : chaque primitive lit sa hauteur (et quelques teintes) dans un JETON
 * (`h-controle` = `var(--spacing-controle)`), dont la valeur par défaut est exactement celle
 * d'avant le ticket ; la portée `/app` (`:root:has([data-portee-app])`) REDÉFINIT le jeton. Deux
 * propriétés en découlent, et ce test les garde :
 *  - le site public ne bouge pas : les valeurs par défaut sont celles d'avant (`h-10`, `h-8`…) ;
 *  - un appelant qui écrit une hauteur garde la main : `twMerge` remplace `h-controle` par son
 *    `h-11` (`densite-de-l-app.test.tsx`), là où une classe `portee-app:h-9` l'aurait raboté.
 *
 * jsdom n'évalue ni `:has()` ni les requêtes média : les hauteurs RENDUES (44 / 32,4 / 48 / 43,2…,
 * au pointeur fin et au pointeur grossier) sont mesurées au navigateur sur la vitrine (notes du
 * ticket, AC1 à AC8).
 */
const RACINE = process.cwd();
const GLOBALS = join(RACINE, 'src', 'app', 'globals.css');
const css = readFileSync(GLOBALS, 'utf8');

function bloc(debut: string, fin: string): string {
  const i = css.indexOf(debut);
  const j = css.indexOf(fin);
  expect(i, `marqueur « ${debut} » absent de globals.css`).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return css.slice(i, j);
}
const BLOC = bloc('/* densite-de-l-app:début', '/* densite-de-l-app:fin */');

/** Les déclarations `--x: valeur;` du premier `@theme { … }` du bloc. */
function theme(): Map<string, string> {
  const t = BLOC.match(/@theme \{([\s\S]*?)\n\}/);
  expect(t, '`@theme { … }` absent du bloc densite-de-l-app').not.toBeNull();
  return new Map([...t![1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const H = 'h';
const candidats = [
  `${H}-controle`,
  `${H}-controle-petit`,
  `${H}-controle-action`,
  'size-controle',
  FIELD_DENSITY_HEIGHT,
  FIELD_DENSITY_HEIGHT_SIZED,
  'text-champ',
  'text-declencheur',
  'text-petit-bouton',
  'px-petit-bouton-x',
  'gap-petit-bouton-espace',
  'rounded-petit-bouton',
  'py-zone-texte-y',
  'leading-zone-texte',
  'bg-fond-champ',
  'bg-fond-contour',
  'text-encre-bouton-doux',
  'text-encre-discrete',
  'border-bord-danger',
  'font-bouton-doux',
];

let compile = '';
beforeAll(async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'takussan-tw-densite-'));
  const contenu = join(dossier, 'contenu.html');
  writeFileSync(contenu, candidats.map((c) => `<i class="${c}"></i>`).join('\n'));
  const source = [
    '@import "tailwindcss" source(none);',
    `@source "${contenu}";`,
    css.split('\n').filter((l) => !/^@import\s+"tailwindcss"/.test(l)).join('\n'),
  ].join('\n');
  compile = (await postcss([tailwind()]).process(source, { from: GLOBALS })).css;
}, 60_000);

/** Position de la règle d'une classe dans la feuille compilée (sélecteur échappé). */
function position(classe: string): number {
  const sel = `.${classe.replace(/([:[\]=.])/g, '\\$1')}`;
  return compile.indexOf(`${sel} {`) > -1 ? compile.indexOf(`${sel} {`) : compile.indexOf(sel);
}

/** Les déclarations d'une règle dont le sélecteur est donné tel quel, dans un texte. */
function declarationsDe(texte: string, selecteur: string): Map<string, string> {
  const i = texte.indexOf(`${selecteur} {`);
  expect(i, `règle « ${selecteur} » absente`).toBeGreaterThan(-1);
  const corps = texte.slice(i, texte.indexOf('}', i));
  return new Map([...corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

describe('TCK-2686 — le site public ne bouge pas : chaque jeton vaut par défaut la classe d’avant', () => {
  it.each([
    ['--spacing-controle', 'calc(var(--spacing) * 10)'], // h-10 / size-10
    ['--spacing-controle-petit', 'calc(var(--spacing) * 8)'], // h-8
    ['--spacing-controle-action', 'calc(var(--spacing) * 12)'], // h-12 (taille neuve)
    ['--spacing-controle-confortable', 'calc(var(--spacing) * 11)'], // h-11 (TCK-468)
    ['--spacing-petit-bouton-x', 'calc(var(--spacing) * 2.5)'], // px-2.5
    ['--spacing-petit-bouton-espace', 'calc(var(--spacing) * 1)'], // gap-1
    ['--radius-petit-bouton', 'min(var(--radius-md), 12px)'],
    ['--text-petit-bouton', 'calc(var(--spacing) * 3.2)'],
    ['--text-champ', 'var(--text-base)'], // text-base (md:text-sm : plus bas)
    ['--text-champ--line-height', 'var(--text-base--line-height)'],
    ['--text-declencheur', 'var(--text-sm)'],
    ['--text-declencheur--line-height', 'var(--text-sm--line-height)'],
    ['--spacing-zone-texte-y', 'calc(var(--spacing) * 2)'], // py-2
    ['--leading-zone-texte', 'var(--text-champ--line-height)'],
    ['--color-fond-champ', 'transparent'], // bg-transparent
    ['--color-fond-contour', 'var(--background)'], // bg-background
    ['--color-encre-bouton-doux', 'var(--secondary-foreground)'],
    ['--color-encre-discrete', 'currentColor'], // ghost : l'encre héritée
    ['--color-bord-danger', 'transparent'], // border-transparent
    ['--font-weight-bouton-doux', '500'], // font-medium
  ])('%s = %s', (nom, valeur) => {
    expect(theme().get(nom)).toBe(valeur);
  });

  it('le texte de champ passe à `text-sm` dès md, comme `md:text-sm` avant (règle sur `:root` seul)', () => {
    const m = BLOC.match(/@media \(width >= 48rem\) \{\s*:root \{([^}]*)\}/);
    expect(m, 'règle `@media (width >= 48rem) { :root { … } }` absente').not.toBeNull();
    expect(m![1]).toMatch(/--text-champ:\s*var\(--text-sm\);/);
    expect(m![1]).toMatch(/--text-champ--line-height:\s*var\(--text-sm--line-height\);/);
  });

  it('tailwind-merge connaît chaque jeton : déclarés = nommés', () => {
    const declares = [...theme().keys()].filter((k) => !k.includes('--line-height')).sort();
    const nommes = Object.entries(DENSITE_DE_L_APP)
      .flatMap(([prefixe, noms]) => noms.map((n) => `--${prefixe}-${n}`))
      .sort();
    expect(declares).toEqual(nommes);
  });
});

describe('TCK-2686 — la portée `/app` redéfinit les jetons', () => {
  it('AC1/AC2/AC8 — régime du pouce (sous md, et au pointeur grossier à TOUTE largeur) : rem FIXES, hors ×0,9', () => {
    const d = declarationsDe(BLOC, ':root:has([data-portee-app])');
    expect(d.get('--spacing-controle')).toBe('2.75rem'); // 44
    expect(d.get('--spacing-controle-petit')).toBe('2.25rem'); // 36 (plancher tactile)
    expect(d.get('--spacing-controle-action')).toBe('3rem'); // 48
    expect(d.get('--spacing-controle-confortable')).toBe('2.75rem');
    expect(d.get('--text-champ')).toBe('1rem'); // 16 : Safari iOS ne zoome pas
    expect(d.get('--text-declencheur')).toBe('1rem');
    // Le petit bouton de la maquette, aux deux largeurs : 13 px, px-3, rounded-lg, gap-1.5.
    expect(d.get('--text-petit-bouton')).toBe('var(--text-ui)');
    expect(d.get('--spacing-petit-bouton-x')).toBe('calc(var(--spacing) * 3)');
    expect(d.get('--spacing-petit-bouton-espace')).toBe('calc(var(--spacing) * 1.5)');
    expect(d.get('--radius-petit-bouton')).toBe('var(--radius)');
    expect(d.get('--spacing-zone-texte-y')).toBe('calc(var(--spacing) * 2.5)');
    expect(d.get('--leading-zone-texte')).toBe('1.375');
  });

  it('AC8 — le régime du bureau exige la largeur ET un pointeur qui n’est pas grossier', () => {
    const m = BLOC.match(/@media ([^{]+)\{\s*:root:has\(\[data-portee-app\]\) \{([^}]*)\}/);
    expect(m, 'régime du bureau absent').not.toBeNull();
    const requete = m![1]!.trim();
    // Une règle posée sur la largeur seule donnerait 32,4 px à un iPad à l'horizontale.
    expect(requete).toContain('48rem');
    expect(requete).toMatch(/not \(pointer: coarse\)/);
    const d = new Map([...m![2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1]!, x[2]!.trim()]));
    expect(d.get('--spacing-controle')).toBe('calc(var(--spacing) * 9)'); // 36 → 32,4 dès lg
    expect(d.get('--spacing-controle-petit')).toBe('calc(var(--spacing) * 8)'); // 32 → 28,8
    expect(d.get('--spacing-controle-action')).toBe('calc(var(--spacing) * 12)'); // 48 → 43,2
    expect(d.get('--spacing-controle-confortable')).toBe('calc(var(--spacing) * 11)'); // 44 → 39,6
    expect(d.get('--text-champ')).toBe('var(--text-sm)'); // 12,6 dès lg
    expect(d.get('--text-declencheur')).toBe('var(--text-sm)');
  });

  it('AC3 — teintes de la maquette au thème clair seulement (le sombre garde les siennes)', () => {
    const d = declarationsDe(BLOC, ':root:not(.dark):has([data-portee-app])');
    expect(d.get('--color-fond-champ')).toBe('var(--card)');
    expect(d.get('--color-fond-contour')).toBe('var(--card)');
    expect(d.get('--color-encre-bouton-doux')).toBe('var(--primary-deep)');
    expect(d.get('--color-encre-discrete')).toBe('var(--encre-douce)');
    expect(d.get('--color-bord-danger')).toBe('color-mix(in oklab, var(--destructive) 30%, transparent)');
    expect(d.get('--font-weight-bouton-doux')).toBe('600');
  });

  it('une surface `.dark` imbriquée relit chaque teinte à sa valeur par défaut (l’alias se résout où il est déclaré)', () => {
    const d = declarationsDe(BLOC, '.dark');
    const t = theme();
    for (const nom of [...t.keys()].filter((k) => k.startsWith('--color-') || k.startsWith('--font-weight-'))) {
      expect(d.get(nom), nom).toBe(t.get(nom));
    }
  });

  it('la feuille compilée émet les deux règles de la portée, et la requête du bureau y survit', () => {
    expect(compile).toContain(':root:has([data-portee-app])');
    expect(compile).toMatch(/not \(pointer: coarse\)/);
  });
});

describe('TCK-2686 — ce que la feuille compilée en fait', () => {
  it.each([
    ['h-controle', 'height: var(--spacing-controle)'],
    ['h-controle-petit', 'height: var(--spacing-controle-petit)'],
    ['h-controle-action', 'height: var(--spacing-controle-action)'],
    ['size-controle', 'width: var(--spacing-controle)'],
    ['bg-fond-champ', 'background-color: var(--color-fond-champ)'],
    ['text-encre-discrete', 'color: var(--color-encre-discrete)'],
    ['font-bouton-doux', 'font-weight: var(--font-weight-bouton-doux)'],
  ])('.%s lit son jeton À L’EXÉCUTION (sinon la portée ne peut pas le redéfinir)', (classe, decl) => {
    const i = position(classe);
    expect(i, `aucune règle pour ${classe}`).toBeGreaterThan(-1);
    expect(compile.slice(i, i + 300)).toContain(decl);
  });

  it('AC2 — la portée « confortable » gagne sur `/app` : sa règle vient APRÈS la hauteur de base', () => {
    // Même spécificité (0,1,0, l'ancêtre passe par `:where()`) : seul l'ordre source tranche.
    const base = position('h-controle');
    const confortable = position(FIELD_DENSITY_HEIGHT);
    expect(base).toBeGreaterThan(-1);
    expect(confortable).toBeGreaterThan(base);
    expect(compile.slice(confortable, confortable + 300)).toContain('height: var(--spacing-controle-confortable)');
  });
});
