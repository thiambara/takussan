/**
 * TCK-2481 — où la coque porte la barre d'onglets mobile. Une règle, deux lecteurs : `AppShell` (la
 * barre) et `CorpsDuWidget` (le bouton flottant « Messagerie », qui ne se rend plus là où la barre
 * porte déjà la messagerie).
 */
import { describe, expect, it } from 'vitest';
import { porteLaBarreDOnglets } from '../plein-ecran';

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
