/**
 * TCK-2481 — où la coque porte la barre d'onglets mobile. Une règle, deux lecteurs : `AppShell` (la
 * barre) et `CorpsDuWidget` (le bouton flottant « Messagerie », qui ne se rend plus là où la barre
 * porte déjà la messagerie).
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defileLeDocument, estFormulaire, porteLaBarreDOnglets, profilDEspace } from '../plein-ecran';

describe('TCK-2481 — où la coque porte la barre d’onglets', () => {
  it.each([
    ['/app', true],
    ['/app/leases', true],
    ['/app/messages/12', true],
    ['/app/properties/new', false], // plein écran (TCK-631)
    ['/application', false],
    ['/publish', false], // hors coque : `src/app/publish/layout.tsx` ne monte pas `AppShell`
    ['/fr/properties', false],
    [null, false],
  ] as [string | null, boolean][])('%s → %s', (chemin, attendu) => {
    expect(porteLaBarreDOnglets(chemin)).toBe(attendu);
  });
});

describe('ADR-0134 (TCK-2989) — où le document défile au téléphone : par la route', () => {
  it.each([
    ['/app', true],
    ['/app/properties', true],
    ['/app/payments', true],
    ['/app/messages', false], // en boîte : la colonne des conversations a une hauteur bornée
    ['/app/messages/12', false],
    ['/app/messagerie', true], // un préfixe de mot n'est pas la route
    ['/app/properties/new', false], // plein écran
    ['/fr/properties', false],
    [null, false],
  ] as const)('%s → %s', (chemin, attendu) => {
    expect(defileLeDocument(chemin)).toBe(attendu);
  });
});

describe('ADR-0136 (TCK-2998) — le profil d’espace d’une page de la console', () => {
  it.each([
    ['/app', {}, 'liste'],
    ['/app/leases', {}, 'liste'],
    ['/app/leases/7', {}, 'liste'],
    ['/app/leases/new', {}, 'formulaire'],
    ['/app/customers/new', {}, 'formulaire'],
    ['/app/properties/new', {}, 'formulaire'], // plein écran de la publication (TCK-631)
    ['/app/properties/12/en-ligne', {}, 'formulaire'],
    ['/app/messages', {}, 'liste'],
    ['/app/messages', { conversation: true }, 'conversation'],
    // L'état n'est admis que là où ADR-0134 l'admet : la messagerie.
    ['/app/leases', { conversation: true }, 'liste'],
    ['/app/news', {}, 'liste'], // `/new` doit être le DERNIER segment, pas un préfixe de mot
    [null, {}, 'liste'],
  ] as const)('%s %o → %s', (chemin, etat, attendu) => {
    expect(profilDEspace(chemin, etat)).toBe(attendu);
  });

  /** Les routes de `src/app/(dashboard)/app`, segments dynamiques remplacés par un exemple. */
  function routesDeLaConsole(): string[] {
    const racine = join(process.cwd(), 'src', 'app', '(dashboard)', 'app');
    const routes: string[] = [];
    const parcourir = (dossier: string, chemin: string) => {
      for (const nom of readdirSync(dossier)) {
        const plein = join(dossier, nom);
        if (statSync(plein).isDirectory()) {
          if (nom === '__tests__' || nom.startsWith('_') || nom.startsWith('@')) continue;
          // Un groupe `(…)` ne fait pas un segment ; un segment `[…]` prend un exemple.
          const segment = nom.startsWith('(') ? '' : nom.startsWith('[') ? '1' : nom;
          parcourir(plein, segment ? `${chemin}/${segment}` : chemin);
        } else if (nom === 'page.tsx') {
          routes.push(chemin);
        }
      }
    };
    parcourir(racine, '/app');
    return routes;
  }

  it('chaque page de la console a un profil ; « formulaire » = exactement les créations et le plein écran', () => {
    const routes = routesDeLaConsole();
    expect(routes.length).toBeGreaterThan(50);
    const formulaires = routes.filter((r) => profilDEspace(r) === 'formulaire').sort();
    expect(formulaires).toEqual(routes.filter((r) => estFormulaire(r) || r === '/app/properties/1/en-ligne').sort());
    // La liste LITTÉRALE : une création ajoutée, renommée ou retirée se voit ici, et se décide (ADR-0136).
    expect(formulaires).toEqual([
      '/app/customers/new',
      '/app/inventories/new',
      '/app/leases/new',
      '/app/maintenance/new',
      '/app/properties/1/en-ligne',
      '/app/properties/new',
    ]);
    for (const r of routes) expect(['liste', 'formulaire']).toContain(profilDEspace(r));
    // Sans l'état, aucune route n'est une conversation.
    expect(routes.some((r) => profilDEspace(r) === 'conversation')).toBe(false);
  });
});
