import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { User } from '@/types/user';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence », AC7) — le layout de `/app` lit les modules
 * masqués sur l'agence qu'il lit DÉJÀ (aucune requête de plus) et les passe à la coque : les seuls
 * codes connus, dans l'ordre des codes ; `[]` sans agence lue. Il ne décide pas à quel persona ils
 * s'appliquent : c'est `composerMenu`.
 */
const getMeAction = vi.fn();
const resolveAgencyOrNull = vi.fn();
const coque = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
// TCK-2621 — l'écran « Choisir un espace » n'est pas l'objet de ce fichier : jamais montré ici.
vi.mock('@/lib/espaces-serveur', () => ({ espacesAChoisir: async () => null }));
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton',
  getActiveProfileId: async () => undefined,
  getModeIconesDuMenu: async () => 'auto' as const,
}));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
  capacitesAmorcees: async () => null,
}));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({ IntlProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: (props: Record<string, unknown>) => {
    coque(props);
    return null;
  },
}));

const { default: AppLayout } = await import('../layout');

const agence = (settings: unknown) => ({ id: 7, kind: 'standard', status: 'active', settings });

async function modules(roles: string[], lue: unknown, agencyId: number | null = 7): Promise<unknown> {
  getMeAction.mockResolvedValue({ id: 1, roles, agency_id: agencyId } as unknown as User);
  resolveAgencyOrNull.mockResolvedValue(lue);
  render(await AppLayout({ children: null }));
  return coque.mock.lastCall?.[0]?.modulesMasques;
}

describe('espace applicatif — les modules masqués par l’agence (TCK-2483, AC7)', () => {
  beforeEach(() => {
    coque.mockClear();
    resolveAgencyOrNull.mockReset();
  });

  it.each([
    // L'admin : un code inconnu est ignoré.
    [['agency_admin', 'customer'], agence({ hidden_modules: ['calendar', 'obsolete'] }), ['calendar']],
    // L'agent : l'ordre est celui des codes, pas celui de la colonne.
    [['agent', 'customer'], agence({ hidden_modules: ['analytics', 'commissions'] }), ['commissions', 'analytics']],
    // Le bailleur reçoit le fait de l'agence ; `composerMenu` ne masque pas sa disposition.
    [['owner', 'customer'], agence({ hidden_modules: ['inventories'] }), ['inventories']],
    // Une forme inattendue ne masque rien.
    [['agent', 'customer'], agence({ hidden_modules: 'calendar' }), []],
    [['agent', 'customer'], agence(null), []],
    // L'agence n'a pas pu être lue.
    [['agent', 'customer'], null, []],
    [['agency_admin', 'customer'], null, []],
    // Le client seul ne lit aucune agence.
    [['customer'], agence({ hidden_modules: ['calendar'] }), []],
  ])('rôles %j, agence %j → %j', async (roles, lue, attendu) => {
    expect(await modules(roles, lue)).toEqual(attendu);
  });

  it('aucune requête de plus : l’agence n’est lue qu’une fois, et pas du tout sans agence', async () => {
    await modules(['agent', 'customer'], agence({ hidden_modules: ['calendar'] }));
    expect(resolveAgencyOrNull).toHaveBeenCalledTimes(1);
    resolveAgencyOrNull.mockReset();
    expect(await modules(['owner', 'customer'], agence({ hidden_modules: ['calendar'] }), null)).toEqual([]);
    expect(resolveAgencyOrNull).not.toHaveBeenCalled();
  });
});
