/**
 * D3 de TCK-461, second volet — **la canonique de TOUTES les pages publiques, dérivée de l'arbre.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX TESTS POUR UNE SEULE PROPRIÉTÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `properties/[slug]/__tests__/page.server.test.tsx` lit la canonique **produite** par le
 * `generateMetadata` de la fiche : il en garde la VALEUR, sur une page. Il ne peut rien dire des
 * onze autres — et le défaut relevé par TCK-461 n'a rien de propre à la fiche : c'est *une ligne
 * qu'on peut retirer sans que rien ne rougisse*.
 *
 * Ce fichier-ci garde la POPULATION, et il la dérive du système de fichiers. Aucune liste de pages
 * n'y est écrite : le jour où une treizième page publique est ajoutée, elle entre dans le périmètre
 * sans qu'on ait à y penser, ce qui est exactement l'inverse du mode de défaillance que TCK-461
 * décrit.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET SON EXEMPTION — DÉRIVÉE, JAMAIS LISTÉE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *     Toute `page.tsx` de `[locale]/(public)` déclare une CANONIQUE (`alternatesPubliques`),
 *     ou se retire de l'index (`index: false`).
 *
 * L'exemption n'est pas une liste de chemins tolérés : c'est une propriété du code lui-même. Une
 * page qui ne s'indexe pas n'a pas de version de référence à désigner — `/compare`, `/favorites`,
 * `/bookings` et `/playground` sont dans ce cas, et le resteront tant qu'ils porteront leur
 * `robots`. Le jour où l'un d'eux redevient indexable, il tombe **automatiquement** sous la règle.
 * *Une exception dérivée d'une propriété du code se referme toute seule ; une exception écrite dans
 * une liste, jamais.*
 *
 * ⚠⚠ **La règle porte sur chaque SORTIE de `generateMetadata`, pas sur le fichier.** Une première
 * rédaction cherchait les deux motifs n'importe où dans la source, et elle était FAUSSE : la fiche
 * de bien porte `robots: { index: false }` sur sa branche « indisponible » (TCK-335), ce qui la
 * faisait passer pour exemptée — **l'ablation de sa canonique la laissait verte**, c'est-à-dire
 * exactement le défaut que ce fichier existe pour fermer. Mesuré le 2026-08-29. D'où la lecture
 * d'AST : chaque objet littéral rendu est jugé séparément, et une page à deux branches doit les
 * satisfaire toutes les deux.
 *
 * ⚠ Ce que ce fichier NE garde pas : la JUSTESSE de la canonique produite. Une garde statique ne
 * peut voir qu'un appel. C'est le rôle du test de page, et c'est pour ça qu'il y en a deux.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PUBLIC = dirname(fileURLToPath(import.meta.url)).replace(/\/__tests__$/, '');

interface PagePublique {
  readonly rel: string;
  readonly source: ts.SourceFile;
}

function pagesPubliques(): PagePublique[] {
  const out: PagePublique[] = [];
  const descendre = (dir: string) => {
    for (const entree of readdirSync(dir)) {
      if (entree === '__tests__') continue;
      const chemin = join(dir, entree);
      if (statSync(chemin).isDirectory()) descendre(chemin);
      else if (entree === 'page.tsx') {
        out.push({
          rel: relative(PUBLIC, chemin),
          source: ts.createSourceFile(
            chemin,
            readFileSync(chemin, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
          ),
        });
      }
    }
  };
  descendre(PUBLIC);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Une SORTIE de métadonnées : un objet littéral que la page rend à Next. */
interface SortieDeMetadonnees {
  readonly page: string;
  readonly ligne: number;
  readonly canonique: boolean;
  readonly horsIndex: boolean;
}

function propriete(objet: ts.ObjectLiteralExpression, nom: string): ts.Expression | null {
  for (const p of objet.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const cle = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
    if (cle === nom) return p.initializer;
  }
  return null;
}

/**
 * `robots` retire-t-il la page de l'index ?
 *
 * Deux formes reconnues, parce que Next les accepte toutes deux : l'objet
 * `{ index: false, … }` et la chaîne `'noindex…'`.
 */
function retireDeLIndex(objet: ts.ObjectLiteralExpression): boolean {
  const robots = propriete(objet, 'robots');
  if (!robots) return false;
  if (ts.isStringLiteral(robots)) return robots.text.includes('noindex');
  if (!ts.isObjectLiteralExpression(robots)) return false;
  const index = propriete(robots, 'index');
  return index?.kind === ts.SyntaxKind.FalseKeyword;
}

/** L'objet contient-il un `alternates` ? (sa justesse est éprouvée ailleurs — cf. l'en-tête.) */
function declareUneCanonique(objet: ts.ObjectLiteralExpression): boolean {
  return propriete(objet, 'alternates') !== null;
}

/**
 * Les objets de métadonnées d'une page : l'initialiseur de `export const metadata`, et chaque
 * `return { … }` de `generateMetadata`.
 *
 * ⚠ Un `return` qui ne rend PAS un objet littéral (une variable, un appel) est illisible ici. Il
 * est compté à part, et le test « toute sortie est analysable » le fait rougir plutôt que de le
 * laisser filer : *une garde qui ne sait pas lire un cas doit le dire, pas l'ignorer.*
 */
function sortiesDe(page: PagePublique): { sorties: SortieDeMetadonnees[]; opaques: string[] } {
  const sorties: SortieDeMetadonnees[] = [];
  const opaques: string[] = [];

  const situer = (n: ts.Node) =>
    page.source.getLineAndCharacterOfPosition(n.getStart()).line + 1;

  const noter = (objet: ts.ObjectLiteralExpression) => {
    sorties.push({
      page: page.rel,
      ligne: situer(objet),
      canonique: declareUneCanonique(objet),
      horsIndex: retireDeLIndex(objet),
    });
  };

  const dansLaFonction = (corps: ts.Node) => {
    const marcher = (n: ts.Node) => {
      // Ne pas descendre dans une fonction imbriquée : son `return` n'est pas celui-ci.
      if (n !== corps && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) return;
      if (ts.isReturnStatement(n)) {
        const valeur = n.expression;
        if (!valeur) return;
        const nu = ts.isAsExpression(valeur) || ts.isSatisfiesExpression(valeur) ? valeur.expression : valeur;
        if (ts.isObjectLiteralExpression(nu)) noter(nu);
        else opaques.push(`${page.rel}:${situer(n)}`);
        return;
      }
      n.forEachChild(marcher);
    };
    marcher(corps);
  };

  for (const declaration of page.source.statements) {
    const exporte = ts.canHaveModifiers(declaration)
      && ts.getModifiers(declaration)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exporte) continue;

    if (ts.isFunctionDeclaration(declaration) && declaration.name?.text === 'generateMetadata') {
      if (declaration.body) dansLaFonction(declaration.body);
      continue;
    }
    if (ts.isVariableStatement(declaration)) {
      for (const d of declaration.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        if (d.name.text !== 'metadata' && d.name.text !== 'generateMetadata') continue;
        const init = d.initializer;
        if (!init) continue;
        const nu = ts.isAsExpression(init) || ts.isSatisfiesExpression(init) ? init.expression : init;
        if (ts.isObjectLiteralExpression(nu)) noter(nu);
        else if (ts.isArrowFunction(nu) || ts.isFunctionExpression(nu)) dansLaFonction(nu.body);
        else opaques.push(`${page.rel}:${situer(d)}`);
      }
    }
  }

  return { sorties, opaques };
}

const PAGES = pagesPubliques();
const SORTIES = PAGES.flatMap((p) => sortiesDe(p).sorties);
const OPAQUES = PAGES.flatMap((p) => sortiesDe(p).opaques);

describe('TCK-461 / D3 — la canonique des pages publiques', () => {
  it('trouve les pages publiques et leurs sorties de métadonnées (non-vacuité)', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(10);
    expect(SORTIES.length).toBeGreaterThanOrEqual(12);
  });

  it('toute sortie de métadonnées est analysable — sinon la garde se tait au lieu de rougir', () => {
    expect(
      OPAQUES,
      `ces retours de generateMetadata ne sont pas des objets littéraux : la règle ci-dessous ne ` +
        `peut rien en dire. Rends l'objet sur place — ${OPAQUES.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque sortie déclare une canonique, ou se retire de l’index', () => {
    const muettes = SORTIES.filter((s) => !s.canonique && !s.horsIndex).map(
      (s) => `${s.page}:${s.ligne}`,
    );

    expect(
      muettes,
      'ces sorties de métadonnées sont indexables et ne désignent AUCUNE version de référence : ' +
        'sans `alternates`, Next n’émet pas de <link rel="canonical"> et les trois langues se ' +
        `concurrencent à l'index — ${muettes.join(', ')}. Appelle alternatesPubliques(chemin, ` +
        'locale), ou déclare robots: { index: false }.',
    ).toEqual([]);
  });

  it('les deux branches de la règle portent RÉELLEMENT sur des sorties (plancher par branche)', () => {
    // Sans ce test, la règle ci-dessus serait verte si TOUTES les sorties devenaient noindex —
    // c'est-à-dire au moment précis où elle cesserait de garder quoi que ce soit.
    expect(
      SORTIES.filter((s) => s.canonique).length,
      'plus aucune sortie publique ne déclare de canonique',
    ).toBeGreaterThanOrEqual(6);
    expect(
      SORTIES.filter((s) => s.horsIndex && !s.canonique).length,
      "plus aucune sortie publique n'est hors index : l'exemption ne couvre plus rien",
    ).toBeGreaterThanOrEqual(4);
  });
});
