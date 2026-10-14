import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { Setting } from '@/types/setting';
import type { User } from '@/types/user';

/**
 * TCK-648 — l'éditeur de la table clé-valeur `settings` quitte `/admin/settings` pour la console.
 *
 * La page est EXÉCUTÉE ; `redirect` lève, comme le vrai. Le layout de `/super-admin` ouvre la
 * console à tout opérateur (`viewer`, `support` compris, TCK-600) : c'est cette page qui réserve
 * l'éditeur au `super_admin`, la même règle que `SettingController` (`isSuperAdmin()`).
 */
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const getMeOperateurAction = vi.fn();
const fetchSettingsAction = vi.fn();
const gestionnaire = vi.fn();

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));
// La console lit l'identité de l'OPÉRATEUR, jamais celle d'une cible impersonnée (TCK-600).
vi.mock('@/app/actions/auth', () => ({ getMeOperateurAction: () => getMeOperateurAction() }));
vi.mock('@/app/actions/admin-settings', () => ({
  fetchSettingsAction: (params: unknown) => fetchSettingsAction(params),
}));
vi.mock('@/components/admin-settings/SettingsManager', () => ({
  SettingsManager: (props: { initialSettings: Setting[]; canManageGlobal: boolean }) => {
    gestionnaire(props);
    return <div data-testid="gestionnaire">{props.initialSettings.map((s) => s.key).join(',')}</div>;
  },
}));

const { default: Page } = await import('../page');

function operateur(roles: User['roles']): User {
  return { id: 1, roles } as User;
}

const LIGNE = { id: 7, key: 'maintenance_mode', scope: 'global', scope_id: null, value: false } as unknown as Setting;

async function destination(): Promise<string | null> {
  try {
    render(await Page());
    return null;
  } catch (e) {
    return String((e as Error).message).replace('NEXT_REDIRECT:', '');
  }
}

describe('/super-admin/settings/global — AC1 : le super-admin lit et modifie', () => {
  beforeEach(() => {
    redirect.mockClear();
    gestionnaire.mockClear();
    fetchSettingsAction.mockReset();
    getMeOperateurAction.mockResolvedValue(operateur(['super_admin']));
  });

  it('rend l’éditeur avec les lignes lues, et le droit d’écrire le global', async () => {
    fetchSettingsAction.mockResolvedValue({ ok: true, data: { data: [LIGNE] } });

    expect(await destination()).toBeNull();

    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres globaux' })).toBeInTheDocument();
    expect(screen.getByTestId('gestionnaire')).toHaveTextContent('maintenance_mode');
    expect(gestionnaire).toHaveBeenCalledWith(expect.objectContaining({ canManageGlobal: true }));
    expect(fetchSettingsAction).toHaveBeenCalledWith({ perPage: 100 });
  });

  it('se présente comme le voisin des Paramètres plateforme, et y mène', async () => {
    fetchSettingsAction.mockResolvedValue({ ok: true, data: { data: [] } });

    await destination();

    expect(screen.getByRole('link', { name: /Paramètres plateforme/ })).toHaveAttribute(
      'href',
      '/super-admin/settings',
    );
  });

  it('un échec de lecture rend l’état d’erreur, pas un éditeur vide', async () => {
    fetchSettingsAction.mockResolvedValue({ ok: false, message: 'boum' });

    await destination();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('gestionnaire')).toBeNull();
  });
});

describe('/super-admin/settings/global — AC2 : réservée au super_admin', () => {
  beforeEach(() => {
    redirect.mockClear();
    fetchSettingsAction.mockReset();
  });

  it.each([
    ['un admin d’agence', ['agency_admin']],
    ['un opérateur viewer ou support (le layout le laisse entrer)', ['customer']],
  ] as const)('%s est renvoyé à l’accueil de la console, sans lecture', async (_qui, roles) => {
    getMeOperateurAction.mockResolvedValue(operateur([...roles]));

    expect(await destination()).toBe('/super-admin');
    expect(fetchSettingsAction).not.toHaveBeenCalled();
  });
});
