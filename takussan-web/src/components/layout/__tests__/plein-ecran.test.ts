/**
 * TCK-2481 — où la coque porte la barre d'onglets mobile. Une règle, deux lecteurs : `AppShell` (la
 * barre) et `CorpsDuWidget` (le bouton flottant « Messagerie », qui ne se rend plus là où la barre
 * porte déjà la messagerie).
 */
import { describe, expect, it } from 'vitest';
import { defileLeDocument, porteLaBarreDOnglets } from '../plein-ecran';

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
