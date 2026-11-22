import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';

/**
 * TCK-2740 AC4 — l'onglet d'une adresse fausse de `/app` dit « Page introuvable », plus « Tableau de bord ».
 *
 * Mesuré sur `next build` + `next start` (2026-11-14) : une 404 de `/app` est servie en document
 * d'erreur de Next, dont le `<head>` porte les métadonnées résolues avec `errorConvention: 'not-found'`
 * — celles du `not-found.tsx` le plus profond. Sans `generateMetadata` dans `../not-found.tsx`, ce
 * titre retombait sur le défaut de `(dashboard)/layout.tsx` (« Tableau de bord »). Après
 * l'hydratation, Next réécrit l'onglet depuis la charge RSC, c'est-à-dire avec le titre de la PAGE :
 * l'attrape-tout doit donc dire la même chose.
 */
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) =>
    espace.split('.').concat(cle).reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], fr),
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: vi.fn() }));

const ATTENDU = fr.dashboard.notFound.heading;

describe('TCK-2740 AC4 — le titre de l’introuvable de /app', () => {
  it('le not-found de /app nomme la page introuvable (titre du document d’erreur servi en 404)', async () => {
    const { generateMetadata } = await import('../not-found');
    expect(ATTENDU).toBe('Page introuvable');
    expect((await generateMetadata()).title).toBe(ATTENDU);
  });

  it('l’attrape-tout porte le même titre, que l’onglet garde après l’hydratation', async () => {
    const { generateMetadata } = await import('../[...introuvable]/page');
    expect((await generateMetadata()).title).toBe(ATTENDU);
  });
});
