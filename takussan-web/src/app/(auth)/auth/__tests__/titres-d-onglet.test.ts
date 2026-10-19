import { describe, expect, it, vi } from 'vitest';

/**
 * TCK-906 (P31.06) — chaque page d'authentification a son titre d'onglet.
 *
 * Avant ce ticket, `(auth)/layout.tsx` posait le modèle « %s — Takussan » et le défaut
 * « Authentification — Takussan », et aucune page ne remplissait le modèle : connexion, inscription
 * et mot de passe oublié portaient le même titre, dans l'onglet comme dans l'historique. Les pages
 * sont `'use client'` et ne peuvent pas exporter de métadonnées : c'est le `layout.tsx` serveur de
 * chaque segment qui les porte. Un test par page (décision du porteur).
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

async function titreDe(charger: () => Promise<{ generateMetadata: () => Promise<{ title?: unknown }> }>) {
  const { generateMetadata } = await charger();
  return (await generateMetadata()).title;
}

describe('pages d’authentification — titre d’onglet (TCK-906)', () => {
  it('/auth/login : « Connexion »', async () => {
    expect(await titreDe(() => import('../login/layout'))).toBe('Connexion');
  });

  it('/auth/register : « Inscription »', async () => {
    expect(await titreDe(() => import('../register/layout'))).toBe('Inscription');
  });

  it('/auth/forgot-password : « Mot de passe oublié »', async () => {
    expect(await titreDe(() => import('../forgot-password/layout'))).toBe('Mot de passe oublié');
  });

  it('/auth/reset-password : « Nouveau mot de passe »', async () => {
    expect(await titreDe(() => import('../reset-password/layout'))).toBe('Nouveau mot de passe');
  });

  it('/auth/verify-email : « Vérification de l’e-mail », lien de vérification compris', async () => {
    // Le layout du segment couvre aussi `verify-email/[id]/[hash]`, la page que l'e-mail ouvre.
    expect(await titreDe(() => import('../verify-email/layout'))).toBe('Vérification de l\'e-mail');
  });

  it('le modèle du groupe complète chaque titre par « — Takussan »', async () => {
    const { generateMetadata } = await import('../../layout');
    const { title } = await generateMetadata();
    expect(title).toMatchObject({ template: '%s — Takussan' });
  });
});
