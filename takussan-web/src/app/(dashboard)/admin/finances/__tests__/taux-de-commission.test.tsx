import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

/**
 * TCK-370, défaut n°4 — **une prop acceptée que personne ne passait**.
 *
 * `AdminFinancesTabs` déclarait `defaultCommissionRate` et le transmettait fidèlement à
 * `CreatePayoutDialog` ; `AdminFinancesClient` ne la portait même pas. Le curseur du dialogue de
 * reversement démarrait donc TOUJOURS à `0` — jamais au taux de l'agence, que
 * `docs/features.md` §1.12 liste pourtant en P1.
 *
 * Le maillon du milieu — `AdminFinancesClient` → `AdminFinancesTabs` — est éprouvé dans
 * `AdminFinancesClient.commission.test.tsx` : il exige un doublon HOISTÉ de `AdminFinancesTabs`,
 * que `vi.doMock` en cours de test ne pose pas.
 *
 * ⚠ **La valeur d'épreuve est 7,5 et non 0, délibérément.** Le défaut se manifeste comme un
 * `?? 0` : un test écrit avec une agence à 0 % passerait avec ET sans le correctif. La chaîne
 * est éprouvée maillon par maillon, du serveur au champ du dialogue, et chaque maillon a été
 * vérifié par ablation.
 */

const TAUX_AGENCE = 7.5;

describe('le taux de commission de l’agence, de la page au dialogue', () => {
  describe('la page /admin/finances', () => {
    const proprietesClient: Array<{ defaultCommissionRate?: number }> = [];

    beforeEach(() => {
      proprietesClient.length = 0;
      vi.resetModules();
    });

    async function rendPage(commission_rate: number | null) {
      vi.doMock('next/navigation', () => ({
        redirect: (url: string) => {
          throw new Error(`NEXT_REDIRECT:${url}`);
        },
      }));
      vi.doMock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
      vi.doMock('@/app/actions/auth', () => ({
        getMeAction: async () => ({
          id: 1,
          first_name: 'Awa',
          last_name: 'Ndiaye',
          full_name: 'Awa Ndiaye',
          roles: ['agency_admin'],
          agency_id: 7,
          avatar_url: null,
        }),
      }));
      vi.doMock('@/app/actions/admin-agency', () => ({
        fetchAgencyAction: async (id: number) => ({
          ok: true,
          data: { id, name: 'Agence Test', slug: 'agence-test', commission_rate },
        }),
      }));
      vi.doMock('../AdminFinancesClient', () => ({
        AdminFinancesClient: (props: { defaultCommissionRate?: number }) => {
          proprietesClient.push(props);
          return <div data-testid="admin-finances-client" />;
        },
      }));
      const { default: Page } = await import('../page');
      render(await Page());
    }

    it("transmet le taux de l'agence, et pas un défaut codé en dur", async () => {
      await rendPage(TAUX_AGENCE);

      expect(proprietesClient.at(-1)?.defaultCommissionRate).toBe(TAUX_AGENCE);
    });

    it("n'invente rien quand l'agence n'a pas de taux", async () => {
      await rendPage(null);

      expect(proprietesClient.at(-1)?.defaultCommissionRate).toBeUndefined();
    });
  });

  describe('le dialogue de reversement', () => {
    it("s'ouvre sur le taux reçu, pas sur zéro", async () => {
      vi.resetModules();
      vi.doMock('@/lib/queries/payments', () => ({
        useCreatePayout: () => ({ mutateAsync: vi.fn() }),
      }));
      const { CreatePayoutDialog } = await import('@/components/payments/CreatePayoutDialog');

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        withIntl(
          <QueryClientProvider client={queryClient}>
            <CreatePayoutDialog
              open
              onOpenChange={() => {}}
              defaultCommissionRate={TAUX_AGENCE}
            />
          </QueryClientProvider>,
        ),
      );

      const champ = await screen.findByLabelText(/Taux commission/i);
      await waitFor(() => expect((champ as HTMLInputElement).value).toBe(String(TAUX_AGENCE)));
    });
  });
});
