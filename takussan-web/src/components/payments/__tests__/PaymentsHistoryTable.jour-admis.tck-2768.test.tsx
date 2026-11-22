import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PaymentsHistoryTable } from '../PaymentsHistoryTable';

const usePaymentsHistory = vi.fn();
const url = vi.hoisted(() => ({ requete: '' }));

vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (...args: unknown[]) => usePaymentsHistory(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(url.requete),
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  usePaymentsHistory.mockReturnValue({
    isLoading: false, isError: false, error: null,
    data: { data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } },
  });
});

function parametresEnvoyes(requete: string): Record<string, unknown> {
  url.requete = requete;
  render(withIntl(<PaymentsHistoryTable />));
  return usePaymentsHistory.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

/**
 * TCK-2768 (q2) — l'historique des paiements relayait `date_from` / `date_to` de l'URL tels quels : un favori
 * « 12/11/2026 » ou « 2026-02-30 » rend désormais 422, et la table restait vide. La borne refusée est ignorée.
 */
describe('PaymentsHistoryTable — une borne d’URL que l’API refuserait est ignorée (TCK-2768)', () => {
  it('« 12/11/2026 », « 2026-02-30 » et « 0001-01-01 » ne partent pas', () => {
    for (const jour of ['12/11/2026', '2026-02-30', '0001-01-01']) {
      const envoyes = parametresEnvoyes(`date_from=${encodeURIComponent(jour)}&date_to=${encodeURIComponent(jour)}`);
      expect(envoyes.date_from, jour).toBeUndefined();
      expect(envoyes.date_to, jour).toBeUndefined();
    }
  });

  it('un jour admis part tel quel', () => {
    expect(parametresEnvoyes('date_from=2026-11-01&date_to=2026-11-12')).toMatchObject({ date_from: '2026-11-01', date_to: '2026-11-12' });
  });
});
