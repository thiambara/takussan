import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchUpcomingOwnerPayouts } from '@/lib/rapports/reversements-a-venir';

/**
 * TCK-2628 (L2) — « Prochains reversements » de la vue d'ensemble du bailleur : les trois premiers, et « Tous »
 * vers la LISTE entière (`/app/payments?tab=payouts` : l'onglet « Reversements » de « Paiements » pour le
 * bailleur, « Argent › Reversements » pour l'hôte par `aiguillerVersLArgent`). Pas vers l'onglet Reversements
 * des rapports : il lit la même fonction, donc les trois mêmes.
 */
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const fr = (await import('@/messages/fr.json')).default;
  return {
    getTranslations: async (namespace?: string) => createTranslator({ locale: 'fr', messages: fr, namespace: namespace as never, timeZone: 'Africa/Dakar' }),
  };
});
vi.mock('@/i18n/locale-serveur', () => ({ localeDeLaRequete: async () => 'fr' }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 7, roles: ['owner'] }) }));
vi.mock('@/lib/rapports/reversements-a-venir', () => ({ fetchUpcomingOwnerPayouts: vi.fn() }));

const { ProchainsReversements } = await import('../ProchainsReversements');

const reversement = (id: number) => ({ id, reference_number: `REV-${id}`, net_amount: 100_000 * id, currency: 'XOF', scheduled_at: `2026-11-${10 + id}` });

beforeEach(() => {
  vi.mocked(fetchUpcomingOwnerPayouts).mockResolvedValue([1, 2, 3, 4].map(reversement) as never);
});

describe('ProchainsReversements', () => {
  it('« Tous » mène à la liste entière des reversements, pas à l’onglet qui relit les trois mêmes', async () => {
    render(await ProchainsReversements({}));
    expect(screen.getByRole('link', { name: 'Tous' }).getAttribute('href')).toBe('/app/payments?tab=payouts');
  });

  it('les trois premiers, lus pour le compte qui regarde', async () => {
    render(await ProchainsReversements({}));
    expect(fetchUpcomingOwnerPayouts).toHaveBeenCalledWith(7);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.includes('REV-'))).toEqual([true, true, true]);
  });
});
