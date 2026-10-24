/**
 * TCK-1367 (P135.01) — la fiche client et le panneau du pipeline lisent TOUTES les notes du client.
 *
 * Avant : `fetchCustomerNotes` ne demandait ni `page` ni `per_page`, et l'API pagine les notes par
 * 20 : un client à 25 notes n'en montrait que 20, et l'onglet affichait « Notes (20) ». Le serveur
 * est bouchonné comme l'API : 20 par défaut, 100 au plus, `meta.last_page`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { CustomerDetail } from '@/types/customer';
import { withIntl } from '@/test/intl';
import { CustomerDetailTabs } from '@/components/customer-dashboard/CustomerDetailTabs';
import { fetchCustomerNotes } from '../customers';

vi.mock('@/components/customer-form', () => ({ CustomerForm: () => null }));
vi.mock('@/components/customer-dashboard/CustomerNotesTimeline', () => ({ CustomerNotesTimeline: () => null }));
vi.mock('@/components/customer-dashboard/CustomerDocumentsPanel', () => ({ CustomerDocumentsPanel: () => null }));

const TOTAL = 25;
const notes = Array.from({ length: TOTAL }, (_, i) => ({ id: TOTAL - i, body: `note ${TOTAL - i}` }));

function bouchonnerApi() {
  const urls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      urls.push(u);
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      return new Response(
        JSON.stringify({
          data: notes.slice((page - 1) * perPage, page * perPage),
          meta: { current_page: page, last_page: Math.ceil(TOTAL / perPage), per_page: perPage, total: TOTAL },
        }),
        { status: 200 },
      );
    }),
  );
  return urls;
}

describe('fetchCustomerNotes — toutes les pages (TCK-1367)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rend les 25 notes, dans l’ordre de l’API', async () => {
    const urls = bouchonnerApi();

    const lues = await fetchCustomerNotes('jeton', 9);

    expect(lues).toHaveLength(TOTAL);
    expect(lues.map((n) => n.id)).toEqual(notes.map((n) => n.id));
    expect(urls.every((u) => u.pathname === '/api/customers/9/notes')).toBe(true);
    // TCK-1842 (P186.03) — `sort` était inerte : l'API sert les épinglées d'abord, puis les plus récentes.
    expect(urls.some((u) => u.searchParams.has('sort'))).toBe(false);
  });

  it('l’onglet de la fiche compte « Notes (25) »', async () => {
    bouchonnerApi();
    const lues = await fetchCustomerNotes('jeton', 9);

    render(withIntl(
      <CustomerDetailTabs customer={{ id: 9 } as CustomerDetail} notes={lues} documents={[]} relationships={[]} />,
    ));

    expect(screen.getByRole('tab', { name: 'Notes (25)' })).toBeInTheDocument();
  });
});
