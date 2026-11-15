import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-2260 (P116.07) — le rapprochement exige `payments.reconcile` (`BankStatementPolicy::viewAny`,
 * et `PAGES_ADMIN`). Le lien de la page des finances suit la même table : un admin dont le rôle
 * retire la capacité ne voit plus un lien qui le renverrait ailleurs. La page est EXÉCUTÉE ; seuls
 * ses appels de bord sont simulés.
 */
const { getMe, accesAdmin } = vi.hoisted(() => ({
  getMe: vi.fn(),
  accesAdmin: vi.fn<(user: unknown) => Promise<{ chemins: string[]; espaceIndividuel: boolean }>>(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/access/pages-admin-server', () => ({
  garderPageAdmin: async () => undefined,
  accesAdmin: (u: unknown) => accesAdmin(u),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
// TCK-2659 — l'en-tête (et le lien) vit désormais dans le client, qui reçoit `rapprochement` ; que
// le client rende le lien sur ce seul drapeau est gardé par `AdminFinancesClient.test.tsx`.
vi.mock('../AdminFinancesClient', () => ({
  AdminFinancesClient: ({ rapprochement }: { rapprochement?: boolean }) => (
    <div data-testid="finances" data-rapprochement={String(Boolean(rapprochement))} />
  ),
}));

const { default: Page } = await import('../page');

const ADMIN = { id: 1, roles: ['agency_admin', 'customer'], agency_id: 7 } as unknown as User;

describe('/app/agency/finances — le lien du rapprochement (TCK-2260)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMe.mockResolvedValue(ADMIN);
  });

  it("ouvre le lien à qui la table ouvre le rapprochement", async () => {
    accesAdmin.mockResolvedValue({
      chemins: ['/app/agency/finances', '/app/agency/finances/reconciliation'],
      espaceIndividuel: false,
    });

    render(await Page());

    expect(screen.getByTestId('finances')).toHaveAttribute('data-rapprochement', 'true');
    expect(accesAdmin).toHaveBeenCalledWith(ADMIN);
  });

  it('ferme le lien à un admin sans payments.reconcile', async () => {
    accesAdmin.mockResolvedValue({ chemins: ['/app/agency/finances'], espaceIndividuel: false });

    render(await Page());

    expect(screen.getByTestId('finances')).toHaveAttribute('data-rapprochement', 'false');
  });
});
