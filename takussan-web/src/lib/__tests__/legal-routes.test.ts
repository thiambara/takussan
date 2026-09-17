/**
 * TCK-531 · AC2 et AC3 — **un lien juridique ne peut plus viser une page qui n'existe pas.**
 *
 * Trois cases de consentement obligatoires renvoyaient à `/terms`, `/privacy` et `/legal/cgu` :
 * trois cibles différentes, trois 404 (relevé du 2026-09-16). Chacune avait écrit son chemin à la
 * main, et rien ne confrontait ces chemins à l'arborescence.
 *
 * Deux propriétés, aucune liste de fichiers à tenir :
 *
 *  1. chaque URL de `ROUTES_LEGALES` est une page que `src/app` sert — l'inventaire est DÉRIVÉ du
 *     système de fichiers (`src/test/routes-publiques.ts`) ;
 *  2. aucun fichier de `src/` n'écrit un chemin juridique en dur — un littéral de forme
 *     `/terms`, `/privacy`, `/legal/…`, `/cgu`… hors de `src/lib/legal-routes.ts` fait rougir,
 *     qu'il existe ou non. C'est ce qui tient l'AC2 : les cases citent les MÊMES URL parce
 *     qu'elles ne peuvent en citer aucune autre.
 *
 * Ablation notée dans le ticket : remettre `href="/terms"` dans `register/page.tsx` fait rougir la
 * propriété 2.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCUMENTS_LEGAUX, ROUTES_LEGALES } from '@/lib/legal-routes';
import { routeExiste } from '@/test/routes-publiques';

const RACINE = join(process.cwd(), 'src');
const SOURCE_UNIQUE = join('lib', 'legal-routes.ts');

/**
 * La FORME d'un chemin juridique, langue éventuelle comprise. Large exprès : `/cgv`,
 * `/conditions-generales`, `/confidentialite`, `/mentions-legales` sont les variantes qu'une
 * prochaine case écrirait à la main. `/app/account/privacy` (réglages de compte) n'en est pas une :
 * le motif est ancré sur le PREMIER segment.
 */
const CHEMIN_JURIDIQUE =
  /^(?:https?:\/\/[^/'"`\s]+|\$\{[^}]*\})?\/(?:(?:fr|en|wo|\$\{[^}]*\})\/)?(?:terms|privacy|legal|cgu|cgv|conditions|confidentialit|mentions|politique)/i;

/**
 * Toute chaîne entre guillemets ou accents graves ; `CHEMIN_JURIDIQUE` trie ensuite. Le préfixe
 * accepté — URL absolue (`https://www.takussan.com/terms`), interpolation de tête
 * (`${base}/privacy`, `/${locale}/terms`) — ferme trois formes que la vérification adverse a fait
 * passer au vert (2026-09-16).
 *
 * ⚠ Angles morts DÉCLARÉS, non fermés : un chemin assemblé par concaténation (`'/' + 'terms'`),
 * un chemin relatif sans `/` de tête (`legal/cgu`), et un segment juridique qui ne vient qu'en
 * valeur interpolée (`/legal/${doc}` est pris, `/${seg}` avec `seg = 'terms'` ne l'est pas).
 * La propriété 1 et `LienLocalise` restent la garde de ces cas-là.
 */
const LITTERAL = /(['"`])([^'"`\s]*)\1/g;

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function fichiersSource(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    if (entree === '__tests__' || entree === 'test') continue;
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) fichiersSource(chemin, acc);
    else if (/\.(ts|tsx)$/.test(entree) && !/\.test\.tsx?$/.test(entree)) acc.push(chemin);
  }
  return acc;
}

function cheminsJuridiquesEnDur(source: string): string[] {
  return [...sansCommentaires(source).matchAll(LITTERAL)]
    .map((m) => m[2]!)
    .filter((chemin) => CHEMIN_JURIDIQUE.test(chemin));
}

describe('routes légales', () => {
  it.each(DOCUMENTS_LEGAUX)('ROUTES_LEGALES.%s mène à une page servie par src/app', (document) => {
    const href = ROUTES_LEGALES[document];
    expect(routeExiste(href), `aucune page sous src/app pour « ${href} »`).toBe(true);
  });

  it('aucun chemin juridique n’est écrit en dur hors de src/lib/legal-routes.ts', () => {
    const fichiers = fichiersSource(RACINE);
    // Plancher : une marche cassée ne lirait rien et rendrait la même sortie verte.
    expect(fichiers.length).toBeGreaterThan(300);

    const fautes = fichiers
      .filter((f) => relative(RACINE, f) !== SOURCE_UNIQUE)
      .flatMap((f) =>
        cheminsJuridiquesEnDur(readFileSync(f, 'utf8')).map(
          (chemin) => `${relative(RACINE, f).split(sep).join('/')} → « ${chemin} »`,
        ),
      );
    expect(fautes, 'utiliser ROUTES_LEGALES (src/lib/legal-routes.ts)').toEqual([]);
  });

  it('les trois cases de consentement du ticket citent ROUTES_LEGALES', () => {
    for (const fichier of [
      'app/(auth)/auth/register/page.tsx',
      'components/onboarding/HostIndividualWizard.tsx',
      'app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx',
    ]) {
      expect(readFileSync(join(RACINE, fichier), 'utf8'), fichier).toMatch(/ROUTES_LEGALES\.\w+/);
    }
  });

  it('reconnaît les formes à refuser, et laisse passer les autres', () => {
    // Mutation de la garde elle-même : sans ces cas, elle pourrait ne plus rien trouver.
    expect(cheminsJuridiquesEnDur(`<Link href="/terms">`)).toEqual(['/terms']);
    expect(cheminsJuridiquesEnDur(`href={'/legal/cgu'}`)).toEqual(['/legal/cgu']);
    expect(cheminsJuridiquesEnDur('const u = `/fr/privacy`;')).toEqual(['/fr/privacy']);
    expect(cheminsJuridiquesEnDur(`href="/mentions-legales"`)).toEqual(['/mentions-legales']);
    expect(cheminsJuridiquesEnDur('href={`/${locale}/terms`}')).toEqual(['/${locale}/terms']);
    expect(cheminsJuridiquesEnDur('href={`${base}/privacy`}')).toEqual(['${base}/privacy']);
    expect(cheminsJuridiquesEnDur(`href="https://www.takussan.com/terms"`)).toEqual([
      'https://www.takussan.com/terms',
    ]);
    expect(cheminsJuridiquesEnDur(`href="https://example.com/app/privacy"`)).toEqual([]);
    expect(cheminsJuridiquesEnDur('const u = `${base}/properties`;')).toEqual([]);
    expect(cheminsJuridiquesEnDur(`href="/app/account/privacy"`)).toEqual([]);
    expect(cheminsJuridiquesEnDur(`href="/properties"`)).toEqual([]);
    expect(cheminsJuridiquesEnDur(`// voir "/terms"\n/* "/privacy" */`)).toEqual([]);
    expect(routeExiste('/terms')).toBe(false);
    expect(routeExiste('/legal/cgu')).toBe(false);
  });
});
