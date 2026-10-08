import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/types/user';

/**
 * TCK-589 — AC7 : la console de la plateforme ne s'ouvre pas sans second facteur, ni après une
 * réinitialisation par le support. Le layout est EXÉCUTÉ ; `redirect` lève, comme le vrai.
 */
const redirect = vi.fn((url: string) => {
  const e = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest?: string };
  e.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw e;
});
const getMeAction = vi.fn();

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
// TCK-600 — la console lit avec le jeton de l'OPÉRATEUR, même pendant une impersonation.
vi.mock('@/app/actions/auth', () => ({ getMeOperateurAction: () => getMeAction() }));
vi.mock('@/lib/session', () => ({ getOperatorToken: async () => 'jeton' }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({ IntlProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/layout/SuperAdminShell', () => ({ SuperAdminShell: () => null }));
vi.mock('@/components/auth/GardeDoubleFacteur', () => ({ GardeDoubleFacteur: () => null }));

const { default: SuperAdminLayout } = await import('../layout');

function superAdmin(champs: Partial<User>): User {
  return { id: 1, roles: ['super_admin'], two_factor_enabled: true, force_2fa_at_first_login: false, ...champs } as User;
}

async function destination(user: User): Promise<string | null> {
  getMeAction.mockResolvedValue(user);
  try {
    await SuperAdminLayout({ children: null });
    return null;
  } catch (e) {
    return String((e as Error).message).replace('NEXT_REDIRECT:', '');
  }
}

describe('layout super-admin — second facteur exigé (AC7)', () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it('sans second facteur → enrôlement', async () => {
    expect(await destination(superAdmin({ two_factor_enabled: false }))).toBe('/onboarding/securite');
  });

  it('second facteur réinitialisé par le support → enrôlement', async () => {
    expect(await destination(superAdmin({ force_2fa_reconfigure: true }))).toBe('/onboarding/securite');
  });

  it('coopté pas encore enrôlé → son propre parcours, comme avant', async () => {
    expect(await destination(superAdmin({ roles: [], two_factor_enabled: false, force_2fa_at_first_login: true }))).toBe(
      '/onboarding/super-admin',
    );
  });

  it('en règle → la console se rend', async () => {
    expect(await destination(superAdmin({}))).toBeNull();
  });
});
