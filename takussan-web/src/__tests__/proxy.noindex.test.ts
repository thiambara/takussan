import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ORIGINE_PRODUCTION } from '@/lib/config-publique';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { proxy } from '../proxy';

/**
 * TCK-926 (P34.05) — hors de la production, toute réponse du proxy porte `X-Robots-Tag: noindex`.
 *
 * Avant, la préproduction n'avait contre l'indexation que l'authentification basique de Dokploy,
 * hors du dépôt : `robots.ts` rend `Allow: /` quel que soit l'environnement. Un en-tête et non
 * `Disallow: /` : un moteur qui ne peut pas charger une page ne lit jamais son `noindex`.
 */
const ORIGINE_PREPRODUCTION = 'https://preview.example.org';

function requete(chemin: string, cookies: Record<string, string> = {}): NextRequest {
  const headers = new Headers();
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL(chemin, ORIGINE_PREPRODUCTION), { headers });
}

// Une page servie, une redirection de langue, une redirection vers la connexion, un passage.
const CHEMINS: Array<[string, Record<string, string>]> = [
  ['/fr/properties', {}],
  ['/properties', {}],
  ['/app', {}],
  ['/auth/login', { [AUTH_COOKIE_NAME]: 'jeton' }],
  ['/publish', {}],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('X-Robots-Tag hors production — TCK-926', () => {
  it.each(CHEMINS)('%s porte noindex quand SITE_URL n’est pas la production', (chemin, cookies) => {
    vi.stubEnv('SITE_URL', ORIGINE_PREPRODUCTION);
    expect(proxy(requete(chemin, cookies)).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it.each(CHEMINS)('%s ne porte rien sur l’origine de production', (chemin, cookies) => {
    vi.stubEnv('SITE_URL', ORIGINE_PRODUCTION);
    expect(proxy(requete(chemin, cookies)).headers.get('X-Robots-Tag')).toBeNull();
  });

  it('ne porte rien sans SITE_URL : le défaut est la production', () => {
    vi.stubEnv('SITE_URL', '');
    expect(proxy(requete('/fr/properties')).headers.get('X-Robots-Tag')).toBeNull();
  });
});
