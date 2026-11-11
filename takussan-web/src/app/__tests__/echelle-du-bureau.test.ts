import { describe, expect, it } from 'vitest';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR-0107 (TCK-2692) — la densité du bureau est un jeu de jetons, la racine reste à 16 px.
 *
 * Remplace le test de TCK-635, qui exigeait `html { font-size: 90% }` dès `lg`. Le rendu du bureau
 * ne change pas (×0,9) ; c'est sa MÉCANIQUE qui change : `html` garde la taille du navigateur, et les
 * échelles de Tailwind passent à ×0,9 dès `lg`.
 *
 * jsdom n'évalue ni les requêtes média d'une feuille ni la cascade : la règle est lue dans
 * `globals.css`, l'utilitaire est lu dans la feuille que compile le Tailwind du dépôt, et la taille
 * réellement calculée (16 px à 390 et à 1440 ; `text-sm` 14 puis 12,6 px) est mesurée au navigateur
 * (notes du ticket, outil de TCK-2684).
 */
const RACINE = process.cwd();
const css = fs.readFileSync(path.join(RACINE, 'src/app/globals.css'), 'utf8');
const theme = fs.readFileSync(path.join(RACINE, 'node_modules/tailwindcss/theme.css'), 'utf8');

/** Chaque déclaration `font-size` posée sur `html`, quelle que soit la requête qui l'entoure. */
function taillesDeHtml(): string[] {
  return [...css.matchAll(/(?:^|[\s},])html\s*\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/font-size\s*:\s*([^;]+);/g)].map((f) => f[1].trim()));
}

/** Le bloc de densité : `@media (width >= 64rem) { :root { … } }` entre ses marqueurs. */
function jetonsDuBureau(): Map<string, string> {
  const debut = css.indexOf('/* densite-du-bureau:début');
  const fin = css.indexOf('/* densite-du-bureau:fin */');
  expect(debut, 'marqueur densite-du-bureau:début absent de globals.css').toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  const bloc = css.slice(debut, fin);
  const racine = bloc.match(/@media \(width >= 64rem\) \{\s*:root \{([^}]*)\}/);
  expect(racine, 'aucun `:root` sous `@media (width >= 64rem)` dans le bloc de densité').not.toBeNull();
  return new Map([...racine![1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const rem = (v: string | undefined) => (v && /^[\d.]+rem$/.test(v) ? Number(v.slice(0, -3)) : NaN);
/** Les échelles du thème de Tailwind qui doivent passer à ×0,9 (la valeur du thème, en rem). */
function echellesDuTheme(): [string, number][] {
  const out: [string, number][] = [];
  for (const m of theme.matchAll(/(--(?:spacing|text-[a-z0-9]+|container-[a-z0-9]+|radius-xs))\s*:\s*([\d.]+)rem;/g)) out.push([m[1], Number(m[2])]);
  return out;
}

describe('ADR-0107 — la racine reste à la taille du navigateur', () => {
  it('aucune déclaration ne fixe la taille de `html`, à aucune largeur', () => {
    expect(taillesDeHtml()).toEqual([]);
  });

  it('le seuil reste celui de `lg` : aucun thème du dépôt ne redéfinit `--breakpoint-lg`', () => {
    expect(css).not.toMatch(/--breakpoint-lg\s*:/);
  });
});

describe('ADR-0107 — dès `lg`, chaque échelle passe à ×0,9', () => {
  const jetons = jetonsDuBureau();

  it('le thème de Tailwind porte bien les échelles attendues (sinon ce test ne contrôle rien)', () => {
    const noms = echellesDuTheme().map(([n]) => n);
    expect(noms).toContain('--spacing');
    expect(noms).toContain('--text-sm');
    expect(noms).toContain('--text-9xl');
    expect(noms).toContain('--container-7xl');
    expect(noms.length).toBeGreaterThan(25);
  });

  it.each(echellesDuTheme())('%s vaut 0,9 × la valeur du thème (%s rem)', (nom, valeur) => {
    expect(rem(jetons.get(nom)), `${nom} absent ou faux dans le bloc de densité`).toBeCloseTo(valeur * 0.9, 6);
  });

  it('`--radius` (la base de `rounded-sm` … `rounded-4xl`) vaut 0,9 × sa valeur de `:root`', () => {
    const base = Number(css.match(/\n {2}--radius: ([\d.]+)rem;/)![1]);
    expect(rem(jetons.get('--radius'))).toBeCloseTo(base * 0.9, 6);
  });

  it('les interlignes du thème sont sans unité : ils suivent la taille, et le bloc ne les redéfinit pas', () => {
    for (const m of theme.matchAll(/--text-[a-z0-9]+--line-height\s*:\s*([^;]+);/g)) expect(m[1]).not.toMatch(/rem|px/);
    expect([...jetons.keys()].filter((k) => k.endsWith('--line-height'))).toEqual([]);
  });

  it('le texte sans classe de taille hérite de 0,9rem dès `lg`, posé sur `body` en couche `base`', () => {
    const base = css.slice(css.lastIndexOf('@layer base {'));
    expect(base).toMatch(/@media \(width >= 64rem\) \{\s*body \{\s*font-size: 0\.9rem;\s*\}/);
  });
});

/** Les blocs `@theme …` de `globals.css`, compilés par le Tailwind du dépôt, sur des candidats. */
async function feuille(candidats: readonly string[]): Promise<string> {
  const themes = [...css.matchAll(/@theme[^{]*\{[^}]*\}/g)].map((m) => m[0]).join('\n');
  const compilateur = await compile(`@import "tailwindcss";\n${themes}`, {
    base: RACINE,
    loadStylesheet: async () => {
      const p = path.join(RACINE, 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
  return compilateur.build([...candidats]);
}
/** La déclaration de `propriete` dans la règle de `.classe` (échappement Tailwind compris). */
function declaration(feuilleCss: string, classe: string, propriete: string): string | null {
  const sel = `.${classe.replace(/[^\w-]/g, (c) => `\\${c}`)}`;
  const i = feuilleCss.indexOf(`${sel} {`);
  if (i < 0) return null;
  const regle = feuilleCss.slice(i, feuilleCss.indexOf('}', i));
  return regle.match(new RegExp(`\\n\\s*${propriete}:\\s*([^;]+);`))?.[1] ?? null;
}

describe('ADR-0107 — chaque utilitaire LIT le jeton (un jeton recopié en valeur ne suivrait pas)', () => {
  it.each([
    ['p-4', 'padding', 'var(--spacing)'],
    ['max-w-88', 'max-width', 'var(--spacing)'],
    ['text-sm', 'font-size', 'var(--text-sm)'],
    ['text-6xl', 'font-size', 'var(--text-6xl)'],
    ['max-w-sm', 'max-width', 'var(--container-sm)'],
    ['rounded-lg', 'border-radius', 'var(--radius)'],
    ['rounded-xl', 'border-radius', 'var(--radius)'],
    ['rounded-xs', 'border-radius', 'var(--radius-xs)'],
    // `rounded` sans suffixe valait `0.25rem` EN DUR : 63 emplois qui n'auraient plus suivi.
    ['rounded', 'border-radius', 'var(--spacing)'],
    ['rounded-t', 'border-top-left-radius', 'var(--spacing)'],
  ])('%s → %s lit %s', async (classe, propriete, lu) => {
    const d = declaration(await feuille([classe]), classe, propriete);
    expect(d, `${classe} n'émet pas ${propriete}`).not.toBeNull();
    expect(d).toContain(lu);
    expect(d).not.toMatch(/\d(\.\d+)?rem/);
  });
});

/**
 * AC7 — un seuil de requête de CONTENEUR en `rem` se lit contre la racine : 16 px partout depuis
 * ADR-0107, 14,4 px au bureau avant. Pour garder son seuil en px, il s'écrit de chaque côté de `lg`
 * (`max-lg:@min-[14rem]/stat:text-xl lg:@min-[12.6rem]/stat:text-xl`), la valeur du bureau à ×0,9.
 * Les relevés de l'outil (notes du ticket) n'atteignent que les seuils que l'échantillon rend ; ce
 * recensement les tient TOUS, et ceux de demain.
 */
describe('ADR-0107 — chaque seuil de conteneur en rem est écrit des deux côtés de `lg`', () => {
  const NOMMES: Record<string, number> = { '3xs': 16, '2xs': 18, xs: 20, sm: 24, md: 28, lg: 32, xl: 36, '2xl': 42, '3xl': 48, '4xl': 56, '5xl': 64, '6xl': 72, '7xl': 80 };
  // Seule exception : la rangée `lg:hidden` de la barre du site, qui ne s'affiche jamais dès `lg`.
  const SOUS_LG_SEULEMENT = new Set(['src/components/home/Navbar.tsx']);
  const VARIANTE = /(?<![\w:\-[])(max-lg:|lg:)?@(min-|max-)?(?:\[([\d.]+)rem\]|(3xs|2xs|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl))(\/[\w-]+)?:([^\s"'`]+)/g;

  function sources(dossier: string): string[] {
    return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || p.includes(path.join('playground', 'maquettes')) ? [] : sources(p);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
  }
  const releve = sources(path.join(RACINE, 'src')).flatMap((f) => {
    const rel = path.relative(RACINE, f);
    return [...fs.readFileSync(f, 'utf8').matchAll(VARIANTE)].map((m) => ({
      rel,
      cote: m[1] ?? '',
      sens: m[2] ?? 'min-',
      rem: m[3] ? Number(m[3]) : NOMMES[m[4]],
      nom: m[5] ?? '',
      utilitaire: m[6],
      texte: m[0],
    }));
  });

  it('le recensement trouve les seuils (sinon ce test ne contrôle rien)', () => {
    expect(releve.filter((v) => v.cote).length).toBeGreaterThanOrEqual(50);
  });

  it('aucun seuil sans côté, hors de la barre du site sous `lg`', () => {
    expect(releve.filter((v) => !v.cote && !SOUS_LG_SEULEMENT.has(v.rel)).map((v) => `${v.rel} : ${v.texte}`)).toEqual([]);
  });

  it('chaque seuil du bureau a son jumeau sous `lg` à ×1/0,9 — même seuil en px, même effet', () => {
    const orphelins: string[] = [];
    for (const v of releve.filter((x) => x.cote)) {
      const autre = v.cote === 'lg:' ? 'max-lg:' : 'lg:';
      const attendu = v.cote === 'lg:' ? v.rem / 0.9 : v.rem * 0.9;
      const jumeau = releve.find((w) => w.rel === v.rel && w.cote === autre && w.sens === v.sens && w.nom === v.nom && w.utilitaire === v.utilitaire && Math.abs(w.rem - attendu) < 1e-6);
      if (!jumeau) orphelins.push(`${v.rel} : ${v.texte} (jumeau attendu ${autre}…${+attendu.toFixed(4)}rem…:${v.utilitaire})`);
    }
    expect(orphelins).toEqual([]);
  });
});
