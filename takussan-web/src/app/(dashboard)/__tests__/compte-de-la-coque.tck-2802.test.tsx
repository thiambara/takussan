/**
 * TCK-2802 (AC1, AC2, AC4) — sous impersonation, la coque de `/app` pose aussi le compte qu'elle a
 * lu quand le layout racine a dépassé sa borne sur `/api/auth/me`.
 *
 * Sous impersonation, `AuthProvider` naît avec `initialToken={null}` (TCK-600) : l'absence de jeton
 * n'y dit pas une session fermée. Le VRAI layout `(dashboard)` lit le cookie d'impersonation par le
 * vrai `estEnImpersonation` (seul `next/headers` est doublé) et le dit à `<CompteDeLaCoque>` par un
 * booléen — jamais par le jeton ni par la valeur du cookie (AC4).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';

const JETON_IMPERSONATION = 'sentinelle-jeton-impersonation-2802';
const JETON_OPERATEUR = 'sentinelle-jeton-operateur-2802';

const agent = {
  id: 7,
  first_name: 'Moussa',
  roles: ['agent'],
  two_factor_enabled: false,
} as unknown as User;

let biscuits: Record<string, string> = {};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom in biscuits ? { name: nom, value: biscuits[nom] } : undefined),
    has: (nom: string) => nom in biscuits,
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/messages',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/i18n/messages', async () => ({
  messagesPour: async () => (await import('@/messages/fr.json')).default,
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn(async () => agent) }));
vi.mock('@/app/actions/account-deletion', () => ({
  getAccountDeletionRequestAction: vi.fn(async () => ({ ok: true, data: null })),
}));

const { default: DashboardGroupLayout } = await import('../layout');
const { AuthProvider } = await import('@/context/AuthContext');
const { CompteDeLaCoque } = await import('@/components/auth/CompteDeLaCoque');
const { EtatVideDeLaMessagerie } = await import('@/components/messages/EtatVideDeLaMessagerie');

beforeEach(() => {
  biscuits = {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function monter() {
  const coque = await DashboardGroupLayout({ children: <EtatVideDeLaMessagerie onNouvelle={() => {}} /> });
  const rendu = render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider initialUser={null} initialToken={null}>
          {coque}
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
  return { coque, rendu };
}

/** Toutes les valeurs atteignables depuis les props de l'arbre que rend le layout. */
function chainesDesProps(noeud: unknown, vus = new Set<unknown>(), chaines: string[] = []): string[] {
  if (noeud === null || noeud === undefined) return chaines;
  if (typeof noeud === 'string') {
    chaines.push(noeud);
    return chaines;
  }
  if (typeof noeud !== 'object' || vus.has(noeud)) return chaines;
  vus.add(noeud);
  if (isValidElement(noeud)) {
    chainesDesProps(noeud.props, vus, chaines);
    return chaines;
  }
  for (const valeur of Object.values(noeud as Record<string, unknown>)) chainesDesProps(valeur, vus, chaines);
  return chaines;
}

/** L'élément `<CompteDeLaCoque>` de l'arbre rendu par le layout. */
function elementDeLaPose(noeud: unknown, vus = new Set<unknown>()): { props: Record<string, unknown> } | null {
  if (noeud === null || typeof noeud !== 'object' || vus.has(noeud)) return null;
  vus.add(noeud);
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) {
      const trouve = elementDeLaPose(enfant, vus);
      if (trouve) return trouve;
    }
    return null;
  }
  if (!isValidElement(noeud)) return null;
  if (noeud.type === CompteDeLaCoque) return noeud as unknown as { props: Record<string, unknown> };
  return elementDeLaPose((noeud.props as { children?: ReactNode }).children, vus);
}

describe('la coque de /app pose le compte qu’elle a lu, sous impersonation (TCK-2802)', () => {
  it('AC1 — cookie d’impersonation, layout racine à `null` sans jeton : l’état vide du personnel', async () => {
    biscuits = { impersonation_token: JETON_IMPERSONATION, auth_token: JETON_OPERATEUR };
    await monter();

    expect(await screen.findByRole('button', { name: 'Écrire à un client' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aucune conversation' })).toBeInTheDocument();
  });

  it('AC2 — sans cookie d’impersonation et sans jeton : rien ne se pose, l’état vide du visiteur', async () => {
    await monter();

    expect(await screen.findByRole('link', { name: 'Parcourir les annonces' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Écrire à un client' })).not.toBeInTheDocument();
  });

  it('AC4 — aucun jeton dans le rendu ni dans les props : le signal est un booléen', async () => {
    biscuits = { impersonation_token: JETON_IMPERSONATION, auth_token: JETON_OPERATEUR };
    const { coque, rendu } = await monter();
    await screen.findByRole('button', { name: 'Écrire à un client' });

    const pose = elementDeLaPose(coque);
    expect(pose).not.toBeNull();
    expect(pose?.props.impersonation).toBe(true);

    const chaines = chainesDesProps(coque);
    expect(chaines.length).toBeGreaterThan(0);
    for (const jeton of [JETON_IMPERSONATION, JETON_OPERATEUR]) {
      expect(chaines.some((chaine) => chaine.includes(jeton))).toBe(false);
      expect(rendu.container.innerHTML).not.toContain(jeton);
      expect(document.documentElement.outerHTML).not.toContain(jeton);
    }
  });
});
