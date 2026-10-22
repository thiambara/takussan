// @vitest-environment node

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-1217 (P79.02) — la mise en page racine n'attend pas `/auth/me` sans borne.
 *
 * Elle est au-dessus de toute page : tant que son `await getMe(…)` ne rend pas, aucune page ne
 * part, publique comprise. Son repli anonyme (`initialUser = null`) n'était atteint qu'au rejet de
 * `fetch`. `getMe` reçoit désormais un signal borné à `DELAI_ME_RACINE_MS`.
 *
 * Le délai réel (5 s) n'est pas attendu : `AbortSignal.timeout` est épié, la valeur relevée.
 */

const getMe = vi.fn();

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: 'f1' }),
  DM_Sans: () => ({ variable: 'f2' }),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (nom: string) => (nom === 'auth_token' ? { value: 'jeton' } : undefined),
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'fr'),
  getTranslations: vi.fn(async () => (cle: string) => cle),
}));
vi.mock('@/i18n/messages', () => ({ messagesPour: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth', () => ({ DELAI_ME_RACINE_MS: 5_000, getMe: (...args: unknown[]) => getMe(...args) }));

import RootLayout from '../layout';
import { AuthProvider } from '@/context/AuthContext';

const timeoutReel = AbortSignal.timeout.bind(AbortSignal);
let delaisDemandes: number[];

beforeEach(() => {
  delaisDemandes = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    delaisDemandes.push(ms);
    return timeoutReel(5);
  });
  // Une API figée : `getMe` ne rend jamais, et ne rejette qu'à l'abandon de son signal.
  getMe.mockImplementation(
    (_jeton: string, _profil?: string, signal?: AbortSignal) =>
      new Promise((_resoudre, rejeter) => {
        signal?.addEventListener('abort', () => rejeter(signal.reason), { once: true });
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  getMe.mockReset();
});

function trouver(noeud: ReactNode, type: unknown): ReactElement | null {
  if (!isValidElement(noeud)) {
    if (Array.isArray(noeud)) {
      for (const enfant of noeud) {
        const trouve = trouver(enfant, type);
        if (trouve) return trouve;
      }
    }
    return null;
  }
  if (noeud.type === type) return noeud;
  return trouver((noeud.props as { children?: ReactNode }).children, type);
}

describe('mise en page racine — getMe borné', () => {
  it('la borne vaut 5 s', async () => {
    const { DELAI_ME_RACINE_MS } = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
    expect(DELAI_ME_RACINE_MS).toBe(5_000);
  });

  it('sur une API figée, se rend en visiteur anonyme sous la borne', async () => {
    const rendu = await Promise.race([
      RootLayout({ children: null }),
      new Promise<never>((_r, rejeter) => setTimeout(() => rejeter(new Error('toujours en attente après 1000 ms')), 1_000)),
    ]);

    const fournisseur = trouver(rendu, AuthProvider);
    expect(fournisseur).not.toBeNull();
    expect((fournisseur?.props as { initialUser: unknown }).initialUser).toBeNull();
    expect(delaisDemandes).toContain(5_000);
  });
});
