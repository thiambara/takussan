/**
 * LE SOMBRE N'EST QU'UNE SURFACE LOCALE — TCK-452, option B (décision du porteur, 2026-11-16).
 *
 * Il n'y a pas de thème sombre global : aucune bascule, aucune lecture de la préférence système,
 * rien ne pose `.dark` sur `<html>`. Le bloc `.dark` de `globals.css` existe parce que des
 * conteneurs le DEMANDENT en posant la classe eux-mêmes (chrome super-admin, bandeau de modération,
 * toast…) ; la liste se dérive de l'arbre JSX (`portees-sombres.ts`), elle ne s'écrit pas.
 *
 * Ce fichier garde l'état d'arrivée, pour qu'il ne redevienne pas l'état mesuré le 2026-08-27 —
 * un bloc appelé « Dark mode » et 75 variantes `dark:` écrites par des gens qui croyaient,
 * raisonnablement, qu'elles servaient :
 *
 *  · AC1 — aucun MÉCANISME de sombre global dans le code (commentaires exclus), ni dans la feuille,
 *    ni au `package.json` ; aucune portée sur `<html>` ou `<body>` ; le bloc ne se dit plus thème.
 *  · AC3 — une variante `dark:` (ou `[.dark_&]`) n'est écrite QUE dans un fichier qu'une portée peut
 *    faire rendre (`fichiersSousPorteeSombre()`, clôture d'import : une sur-approximation). Ailleurs,
 *    elle ne s'applique jamais : c'est du code qui ment. Les primitives `components/ui/**` suivent la
 *    MÊME règle, sans exception : celles qu'une portée monte gardent leurs `dark:` (bouton, champ,
 *    zone de texte, avatar), les autres les ont perdus — et une primitive shadcn régénérée qui les
 *    ramène fait rougir ce test, ce qui est voulu.
 *  · AC1bis — les porteurs vivants sont toujours là.
 *
 * ⚠ Angle mort connu : un nœud INJECTÉ dans une portée (`toast.data.action`, `children`) n'est pas
 * dans la clôture d'import du porteur. Au 2026-11-16, les deux injections réelles du toast
 * (`ActionDuToast`, `LienBoosterApresPublication` → `buttonVariants`) n'atteignent que des fichiers
 * déjà sous portée. Une primitive neuve injectée là devra y être ajoutée par un import du porteur.
 *
 * Les classes se lisent dans les LITTÉRAUX de chaînes (AST), pas dans le texte : un commentaire qui
 * cite `dark:` pour l'expliquer n'est pas une variante, et un `.ts` de tables de tons en est une.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { RACINE_SRC, nommer, sourcesDe } from '../analyse-statique';
import { JETONS_CLAIR, JETONS_SOMBRE } from '../contraste-wcag';
import { fichiersSousPorteeSombre, porteesSombres } from '../portees-sombres';

const SOURCES = sourcesDe(RACINE_SRC).filter(
  (f) => !/\.test\.tsx?$/.test(f) && !f.includes('/playground/maquettes/'),
);

/** `dark:…`, `hover:dark:…`, `[.dark_&]:…` — une classe qui ne s'applique que sous `.dark`. */
const VARIANTE_SOMBRE = /(^|:)dark:|\[\.dark[_\]]/;

/** Les classes à variante sombre écrites dans les littéraux d'un fichier. */
function variantesSombres(fichier: string): string[] {
  const source = ts.createSourceFile(fichier, readFileSync(fichier, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const lire = (texte: string) => {
    for (const classe of texte.split(/\s+/)) if (VARIANTE_SOMBRE.test(classe)) out.push(classe);
  };
  const marcher = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) lire(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) lire(n.text);
    else if (ts.isJsxText(n)) return;
    n.forEachChild(marcher);
  };
  marcher(source);
  return out;
}

/** Le code d'un fichier, commentaires retirés (scanner de TypeScript, pas une expression régulière). */
function codeSansCommentaires(fichier: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, readFileSync(fichier, 'utf8'));
  let out = '';
  for (let jeton = scanner.scan(); jeton !== ts.SyntaxKind.EndOfFileToken; jeton = scanner.scan()) {
    out += `${scanner.getTokenText()} `;
  }
  return out;
}

const FEUILLE = readFileSync(join(RACINE_SRC, 'app/globals.css'), 'utf8');
const FEUILLE_SANS_COMMENTAIRES = FEUILLE.replace(/\/\*[\s\S]*?\*\//g, '');

describe('TCK-452 — pas de sombre global (AC1)', () => {
  it('aucun mécanisme de bascule dans le code : fournisseur, bibliothèque, préférence système, classe sur la racine', () => {
    const MECANISME = /ThemeProvider|next-themes|prefers-color-scheme|documentElement\s*\.\s*classList|colorScheme/;
    const trouves = SOURCES.filter((f) => MECANISME.test(codeSansCommentaires(f))).map(nommer);
    expect(trouves, 'un mécanisme de thème global est apparu : TCK-452 a tranché contre').toEqual([]);
    const paquet = readFileSync(join(RACINE_SRC, '..', 'package.json'), 'utf8');
    expect(paquet).not.toMatch(/next-themes/);
  });

  it('la feuille ne lit pas la préférence système et ne pose pas le sombre sur la racine', () => {
    expect(FEUILLE_SANS_COMMENTAIRES).not.toMatch(/prefers-color-scheme|color-scheme\s*:\s*dark/);
    expect(FEUILLE_SANS_COMMENTAIRES).not.toMatch(/(:root|html|body)\.dark\b/);
  });

  it('aucune portée `.dark` posée sur `<html>` ou `<body>`', () => {
    const globales = porteesSombres().filter((p) => p.balises.includes('html') || p.balises.includes('body'));
    expect(globales.map((p) => p.fichier)).toEqual([]);
  });

  it('le bloc ne se dit plus « thème » : il est la surface sombre locale', () => {
    expect(FEUILLE).not.toMatch(/dark mode|thème sombre|mode sombre/i);
    expect(FEUILLE).toMatch(/La SURFACE SOMBRE LOCALE \(TCK-452\)/);
  });
});

describe('TCK-452 — une variante `dark:` ne vit que sous une portée (AC3)', () => {
  const sousPortee = fichiersSousPorteeSombre();

  it('zéro variante sombre hors des fichiers qu’une portée `.dark` peut rendre', () => {
    const hors: string[] = [];
    let dedans = 0;
    for (const f of SOURCES) {
      const v = variantesSombres(f);
      if (v.length === 0) continue;
      if (sousPortee.has(nommer(f))) dedans += v.length;
      else hors.push(`${nommer(f)} : ${v.join(' ')}`);
    }
    expect(hors, 'variante(s) `dark:` qui ne s’appliquent jamais — aucune portée ne monte ce fichier').toEqual([]);
    // Une garde qui ne voit plus rien rend le même vert qu'une garde satisfaite : le bouton, le
    // champ, la zone de texte, l'avatar et le toast portent les leurs (19 au 2026-11-16).
    expect(dedans).toBeGreaterThan(15);
  });

  it('auto-épreuve : une variante écrite dans un fichier hors portée est vue, un commentaire ne l’est pas', () => {
    const racine = mkdtempSync(join(tmpdir(), 'sombre-local-'));
    const f = join(racine, 'Invente.tsx');
    writeFileSync(f, [
      '// dark:bg-muted — cité dans un commentaire',
      "const TONS = { ok: 'bg-success/10 dark:bg-success/20' };",
      'export function Invente({ a }: { a: boolean }) {',
      '  return <div className={`p-2 ${a ? "hover:dark:text-white" : ""} [.dark_&]:ring-1`}>dark: texte</div>;',
      '}',
      "export const pasUneClasse = { dark: true, 'text-white': false };",
    ].join('\n'));
    expect(variantesSombres(f)).toEqual(['dark:bg-success/20', 'hover:dark:text-white', '[.dark_&]:ring-1']);
    expect(sousPortee.has(nommer(f))).toBe(false);
  });
});

describe('TCK-452 — les surfaces sombres réelles rendent toujours leurs couleurs (AC1bis)', () => {
  it('les porteurs vivants sont dérivés, et la surface du bloc `.dark` diffère du clair', () => {
    const porteurs = porteesSombres().map((p) => p.fichier);
    expect(porteurs).toEqual(expect.arrayContaining([
      'components/layout/SuperAdminSidebar.tsx',
      'components/layout/SuperAdminTopbar.tsx',
      'components/layout/SuperAdminShell.tsx',
      'components/admin/super/agency-detail.tsx',
      'components/ui/toast.tsx',
    ]));
    // La valeur DÉCLARÉE par le bloc, lue dans la feuille — pas la table recopiée.
    const bloc = FEUILLE_SANS_COMMENTAIRES.match(/\n\.dark \{([^}]*)\}/)![1]!;
    const fond = bloc.match(/--background:\s*([^;]+);/)![1]!.trim();
    const encre = bloc.match(/--foreground:\s*([^;]+);/)![1]!.trim();
    expect(fond).toBe('#1f1812');
    expect(encre).toBe('#fcf9f3');
    expect(JETONS_SOMBRE.background).toBe(fond);
    expect(JETONS_SOMBRE.background).not.toBe(JETONS_CLAIR.background);
  });
});
