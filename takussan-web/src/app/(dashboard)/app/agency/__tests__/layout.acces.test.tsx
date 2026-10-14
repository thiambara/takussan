import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-649 (ADR-0064 §2) — le layout de la section d'agence `/app/agency`.
 *
 * Il ne monte AUCUNE coque : celle de `/app` (`AppShell`, avec `AccesAdminProvider`) est déjà montée
 * par `app/layout.tsx`, et une seconde ferait changer de coque en entrant dans l'administration —
 * exactement ce que l'ADR supprime. Il garde le segment (rôle d'administration) et sert la frontière
 * de dictionnaire de l'administration. Le layout est EXÉCUTÉ ; seuls ses appels de bord sont simulés.
 */
const { getMe, redirect, messagesPour } = vi.hoisted(() => ({
  getMe: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  messagesPour: vi.fn(async (frontiere: string) => ({ frontiere })),
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/i18n/messages', () => ({ messagesPour: (f: string) => messagesPour(f) }));
vi.mock('@/i18n/IntlProvider', () => ({
  IntlProvider: ({ messages, children }: { messages: { frontiere: string }; children: React.ReactNode }) => (
    <div data-testid="frontiere" data-frontiere={messages.frontiere}>
      {children}
    </div>
  ),
}));

const { default: AgencyLayout } = await import('../layout');

const ADMIN = { id: 1, roles: ['agency_admin', 'customer'], agency_id: 7 } as unknown as User;

describe('layout /app/agency (TCK-649)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rend ses enfants sous la frontière de dictionnaire de l'administration, sans coque", async () => {
    getMe.mockResolvedValue(ADMIN);

    const { container, getByTestId } = render(
      await AgencyLayout({ children: <p data-testid="page">page</p> }),
    );

    expect(messagesPour).toHaveBeenCalledWith('(dashboard)/app/agency');
    expect(getByTestId('frontiere')).toHaveAttribute('data-frontiere', '(dashboard)/app/agency');
    // Aucune coque : la frontière ne contient QUE la page — ni barre, ni `<main>`, ni tiroir.
    expect(getByTestId('frontiere').children).toHaveLength(1);
    expect(container.querySelector('aside, nav, main, header')).toBeNull();
  });

  it('le super-admin passe la garde du segment', async () => {
    getMe.mockResolvedValue({ id: 3, roles: ['super_admin'], agency_id: null });
    await expect(AgencyLayout({ children: null })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['client', ['customer']],
    ['agent', ['agent', 'customer']],
    ['bailleur', ['owner', 'customer']],
    ['locataire', ['tenant', 'customer']],
  ])('éjecte un %s vers /app, sans servir le dictionnaire', async (_profil, roles) => {
    getMe.mockResolvedValue({ id: 2, roles, agency_id: 7 });
    await expect(AgencyLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /app');
    expect(redirect).toHaveBeenCalledWith('/app');
    expect(messagesPour).not.toHaveBeenCalled();
  });
});
