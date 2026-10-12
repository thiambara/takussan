/**
 * TCK-633 (lot B, AC3) — la déconnexion VOLONTAIRE depuis le site public ramène à l'accueil, dans
 * la langue de l'utilisateur, et jamais vers `/auth/login`.
 *
 * `Navbar.deconnexion.test.tsx` (TCK-509) garde le nettoyage de la session, pas la destination :
 * il n'asserte que la PRÉSENCE d'un `router.push`. Une régression vers `/auth/login` y restait
 * verte (relevé du vérificateur du lot B). Ce fichier garde la destination sur les deux branches
 * de `Navbar.handleLogout` :
 *   - bureau (menu utilisateur) → `router.push(accueil)` ;
 *   - mobile (panneau) hors de l'accueil → `router.replace(accueil)` (la sentinelle d'historique
 *     est remplacée, TCK-551) ; depuis l'accueil même → `router.push(accueil)`.
 * Et l'ordre : la navigation n'a lieu qu'APRÈS la révocation (TCK-509).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { User } from '@/lib/auth';

const etat = vi.hoisted(() => ({
  chemin: '/fr/properties',
  evenements: [] as string[],
}));

const router = vi.hoisted(() => ({
  push: vi.fn((href: string) => { etat.evenements.push(`push:${href}`); }),
  replace: vi.fn((href: string) => { etat.evenements.push(`replace:${href}`); }),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
}));

// La révocation se termine sur une micro-tâche ULTÉRIEURE : une navigation lancée sans attendre
// `logout()` s'intercale avant « logout:fin ».
const logout = vi.hoisted(() =>
  vi.fn(async () => {
    etat.evenements.push('logout:debut');
    await Promise.resolve();
    await Promise.resolve();
    etat.evenements.push('logout:fin');
  }),
);

const COMPTE = {
  id: 7, first_name: 'Astou', last_name: 'Dieng', full_name: 'Astou Dieng',
  email: 'astou@example.test', roles: [],
} as unknown as User;

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => etat.chemin,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: COMPTE, isLoading: false, logout, setUser: vi.fn(), token: 'jeton' }),
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn(async () => {}) }));

const { Navbar } = await import('@/components/home/Navbar');

const LIBELLES: Record<'fr' | 'wo', { menuCompte: string; deconnexion: string; ouvrirMenu: string }> = {
  fr: { menuCompte: 'Menu utilisateur', deconnexion: 'Déconnexion', ouvrirMenu: 'Ouvrir le menu' },
  wo: { menuCompte: 'Menu jëfandikukat', deconnexion: 'Génn', ouvrirMenu: 'Ubbil menu bi' },
};

function monter(locale: LocaleDeTest) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{withIntl(<Navbar />, locale)}</QueryClientProvider>);
  return userEvent.setup();
}

async function seDeconnecterAuBureau(locale: 'fr' | 'wo') {
  const user = monter(locale);
  await user.click(screen.getByRole('button', { name: LIBELLES[locale].menuCompte }));
  await user.click(screen.getByRole('button', { name: LIBELLES[locale].deconnexion }));
}

async function seDeconnecterAuMobile(locale: 'fr' | 'wo') {
  const user = monter(locale);
  await user.click(screen.getByRole('button', { name: LIBELLES[locale].ouvrirMenu }));
  const panneau = await screen.findByRole('dialog');
  await user.click(within(panneau).getByRole('button', { name: LIBELLES[locale].deconnexion }));
}

function navigations() {
  return etat.evenements.filter((e) => e.startsWith('push:') || e.startsWith('replace:'));
}

describe('Navbar publique — destination de la déconnexion (TCK-633, AC3)', () => {
  beforeEach(() => {
    etat.chemin = '/fr/properties';
    etat.evenements = [];
    router.push.mockClear();
    router.replace.mockClear();
    logout.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, data: [], meta: { requested_ids: [], returned_ids: [] } }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('bureau (menu utilisateur)', () => {
    it.each([
      ['fr', '/fr/properties', '/fr'],
      ['wo', '/wo/properties', '/wo'],
    ] as const)('%s : accueil localisé, après la révocation, jamais /auth/login', async (locale, chemin, accueil) => {
      etat.chemin = chemin;
      await seDeconnecterAuBureau(locale);

      await waitFor(() => expect(navigations()).toHaveLength(1));
      expect(etat.evenements).toEqual(['logout:debut', 'logout:fin', `push:${accueil}`]);
      expect(router.replace).not.toHaveBeenCalled();
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });

  describe('mobile (panneau)', () => {
    it.each([
      ['fr', '/fr/properties', '/fr'],
      ['wo', '/wo/properties', '/wo'],
    ] as const)(
      '%s, hors de l’accueil : remplace par l’accueil localisé, après la révocation',
      async (locale, chemin, accueil) => {
        etat.chemin = chemin;
        await seDeconnecterAuMobile(locale);

        await waitFor(() => expect(navigations()).toHaveLength(1));
        expect(etat.evenements).toEqual(['logout:debut', 'logout:fin', `replace:${accueil}`]);
        expect(router.push).not.toHaveBeenCalled();
        expect(logout).toHaveBeenCalledTimes(1);
      },
    );

    it('fr, depuis l’accueil même : pousse l’accueil localisé (rien à remplacer)', async () => {
      etat.chemin = '/fr';
      await seDeconnecterAuMobile('fr');

      await waitFor(() => expect(navigations()).toHaveLength(1));
      expect(etat.evenements).toEqual(['logout:debut', 'logout:fin', 'push:/fr']);
    });
  });
});
