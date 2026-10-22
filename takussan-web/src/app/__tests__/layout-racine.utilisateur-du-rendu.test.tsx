// @vitest-environment node

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-1374 (P138.02, P138.03) — la mise en page racine lit l'utilisateur par la promesse
 * mémoïsée de `getMeAction`, sous le profil actif.
 *
 * Avant : la racine appelait `getMe(jeton)` sans indice de profil, hors de `cache()`. Chaque
 * document de `/app` portait deux `GET /api/auth/me`, et le `user` remis à `AuthProvider` était
 * celui de l'auto-bascule de l'API : `agency_id` à `null` pour un compte de plusieurs agences.
 *
 * `cache()` de React ne mémoïse que sous la condition `react-server`, que vitest ne pose pas : il
 * est remplacé ici par une mémoïsation par rendu, celle que Next applique à une requête.
 */

const getMe = vi.fn();
let cookiesDuRendu: Record<string, string>;
const caches = vi.hoisted((): Array<() => void> => []);

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      caches.push(() => memo.clear());
      return (...args: A): R => {
        const cle = JSON.stringify(args);
        if (!memo.has(cle)) memo.set(cle, fn(...args));
        return memo.get(cle) as R;
      };
    },
  };
});
vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: 'f1' }),
  DM_Sans: () => ({ variable: 'f2' }),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (nom: string) => (nom in cookiesDuRendu ? { value: cookiesDuRendu[nom] } : undefined),
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((cible: string) => {
    throw new Error(`redirect:${cible}`);
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'fr'),
  getTranslations: vi.fn(async () => (cle: string) => cle),
}));
vi.mock('@/i18n/messages', () => ({ messagesPour: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth', () => ({
  DELAI_ME_RACINE_MS: 5_000,
  getMe: (...args: unknown[]) => getMe(...args),
  resendVerification: vi.fn(),
  updateProfile: vi.fn(),
}));

import RootLayout from '../layout';
import { getMeAction, getMeOperateurAction } from '../actions/auth';
import { AuthProvider } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';

const utilisateur = { id: 7, agency_id: 3 };

beforeEach(() => {
  caches.forEach((vider) => vider());
  cookiesDuRendu = { auth_token: 'jeton', active_profile_id: '42' };
  getMe.mockImplementation(async () => utilisateur);
});

afterEach(() => {
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

async function utilisateurDeLaRacine(): Promise<unknown> {
  const rendu = await RootLayout({ children: null });
  return (trouver(rendu, AuthProvider)?.props as { initialUser: unknown }).initialUser;
}

describe('mise en page racine — l’utilisateur du rendu', () => {
  it('P138.03 : lit /api/auth/me sous le profil actif du cookie', async () => {
    expect(await utilisateurDeLaRacine()).toEqual(utilisateur);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(getMe.mock.calls[0][0]).toBe('jeton');
    expect(getMe.mock.calls[0][1]).toBe('42');
  });

  it('P138.02 : la racine et getMeAction ne font qu’un /api/auth/me par document', async () => {
    const [racine, coque] = await Promise.all([utilisateurDeLaRacine(), getMeAction()]);
    expect(racine).toEqual(utilisateur);
    expect(coque).toEqual(utilisateur);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('P138.02 : la console sans impersonation partage la même lecture', async () => {
    await Promise.all([utilisateurDeLaRacine(), getMeOperateurAction()]);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('impersonation : la racine lit la cible, sans profil ; la console lit l’opérateur à part', async () => {
    cookiesDuRendu = { auth_token: 'jeton', active_profile_id: '42', impersonation_token: 'cible' };
    await Promise.all([utilisateurDeLaRacine(), getMeOperateurAction()]);
    expect(getMe).toHaveBeenCalledTimes(2);
    expect(getMe.mock.calls.map((appel) => [appel[0], appel[1]])).toEqual(
      expect.arrayContaining([
        ['cible', undefined],
        ['jeton', '42'],
      ]),
    );
  });

  it('un 401 rend la racine anonyme, sans redirection ; getMeAction, lui, redirige', async () => {
    getMe.mockImplementation(async () => {
      throw new ApiError(401, {});
    });
    expect(await utilisateurDeLaRacine()).toBeNull();
    await expect(getMeAction()).rejects.toThrow('redirect:/api/auth/session-expired');
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('sans jeton : aucune lecture', async () => {
    cookiesDuRendu = {};
    expect(await utilisateurDeLaRacine()).toBeNull();
    expect(getMe).not.toHaveBeenCalled();
  });
});
