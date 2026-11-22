/**
 * TCK-633 (lot B, AC3) — la déconnexion VOLONTAIRE depuis le site public ramène à l'accueil, dans
 * la langue de l'utilisateur, et jamais vers `/auth/login`.
 *
 * `Navbar.deconnexion.test.tsx` (TCK-509) garde le nettoyage de la session, pas la destination :
 * il n'asserte que la PRÉSENCE d'un `router.push`. Une régression vers `/auth/login` y restait
 * verte (relevé du vérificateur du lot B). Ce fichier garde la destination sur les deux surfaces :
 *   - bureau (menu « Mon espace », TCK-2494) → `router.push(accueil)` ;
 *   - mobile (écran « Moi », `/account`, TCK-2493 — le panneau du menu a quitté la barre) →
 *     `router.replace(accueil)` : revenir en arrière sur « Moi » déconnecté n'a pas de sens.
 * Et l'ordre : la navigation n'a lieu qu'APRÈS la révocation (TCK-509).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
const { EcranDuCompte } = await import('@/components/navigation-publique/EcranDuCompte');

/** Le wolof est en pause (2026-10-16) : les clés neuves portent en `wo` le texte français. */
const LIBELLES: Record<'fr' | 'wo', { monEspace: RegExp; deconnexion: string }> = {
  fr: { monEspace: /Mon espace/, deconnexion: 'Se déconnecter' },
  wo: { monEspace: /Mon espace/, deconnexion: 'Se déconnecter' },
};

function monter(ui: React.ReactElement, locale: LocaleDeTest) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{withIntl(ui, locale)}</QueryClientProvider>);
  return userEvent.setup();
}

async function seDeconnecterAuBureau(locale: 'fr' | 'wo') {
  const user = monter(<Navbar />, locale);
  await user.click(screen.getByRole('button', { name: LIBELLES[locale].monEspace }));
  await user.click(await screen.findByRole('menuitem', { name: LIBELLES[locale].deconnexion }));
}

async function seDeconnecterAuMobile(locale: 'fr' | 'wo') {
  const user = monter(<EcranDuCompte />, locale);
  await user.click(screen.getByRole('button', { name: LIBELLES[locale].deconnexion }));
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

  describe('bureau (menu « Mon espace »)', () => {
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

  describe('mobile (écran « Moi »)', () => {
    it.each([
      ['fr', '/fr/account', '/fr'],
      ['wo', '/wo/account', '/wo'],
    ] as const)('%s : remplace par l’accueil localisé, après la révocation', async (locale, chemin, accueil) => {
      etat.chemin = chemin;
      await seDeconnecterAuMobile(locale);

      await waitFor(() => expect(navigations()).toHaveLength(1));
      expect(etat.evenements).toEqual(['logout:debut', 'logout:fin', `replace:${accueil}`]);
      expect(router.push).not.toHaveBeenCalled();
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });
});
