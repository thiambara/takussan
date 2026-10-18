import { describe, expect, it, vi } from 'vitest';

/**
 * TCK-907 (P31.07) — `/invitations/accept` porte le suffixe « — Takussan » comme les autres pages.
 *
 * Mesuré par `document.title` (P31.07) : « Accepter une invitation », seul. La page rend
 * `t('metaTitle')`, et `invitations/layout.tsx` ne posait aucun modèle, alors que `(public)`,
 * `(auth)` et `(dashboard)` posent tous « %s — Takussan ».
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => null }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));

describe('/invitations/accept — titre d’onglet (TCK-907)', () => {
  it('le layout du sous-arbre pose le modèle commun', async () => {
    const { generateMetadata } = await import('../layout');
    const { title } = await generateMetadata();
    expect(title).toMatchObject({ template: '%s — Takussan' });
  });

  it('la page remplit ce modèle par son propre titre, sans le suffixe en double', async () => {
    const { generateMetadata } = await import('../accept/page');
    const { title } = await generateMetadata();
    expect(title).toBe('Accepter une invitation');
  });
});
