/**
 * TCK-1369 (P135.03) — le calendrier d'un bien lit TOUS ses séjours confirmés.
 *
 * Avant : une seule page de 100, triée par `start_date` croissant. Aucun séjour ne passe à
 * `completed` : au 101ᵉ, le séjour le plus récent sortait de la page, et sa nuit s'affichait libre.
 * Ici, l'API est bouchonnée (100 lignes au plus par page, dans l'ordre demandé) et le panneau monté
 * avec ses vrais hooks : 100 séjours passés, puis un séjour qui couvre la nuit d'aujourd'hui.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';

import { withIntl } from '@/test/intl';
import { PropertyCalendarPanel } from '../PropertyCalendarPanel';

const jour = (d: Date) => format(d, 'yyyy-MM-dd');
const passes = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  reference_number: `BK-${i + 1}`,
  status: 'confirmed',
  start_date: jour(addDays(new Date(2020, 0, 1), i * 3)),
  end_date: jour(addDays(new Date(2020, 0, 1), i * 3 + 2)),
  property_id: 7,
}));
const enCours = {
  id: 101,
  reference_number: 'BK-101',
  status: 'confirmed',
  start_date: jour(new Date()),
  end_date: jour(addDays(new Date(), 1)),
  property_id: 7,
};
const sejours = [...passes, enCours];

function bouchonnerApi() {
  const pages: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      if (u.pathname === '/api/bookings') {
        const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
        const page = Number(u.searchParams.get('page') ?? 1);
        pages.push(`${page}/${u.searchParams.get('sort')}/${u.searchParams.get('per_page')}`);
        return new Response(
          JSON.stringify({
            data: sejours.slice((page - 1) * perPage, page * perPage),
            meta: { current_page: page, last_page: Math.ceil(sejours.length / perPage), per_page: perPage, total: sejours.length },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }),
  );
  return pages;
}

describe('PropertyCalendarPanel — tous les séjours confirmés (TCK-1369)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('peint la nuit d’un séjour au-delà des 100 premiers', async () => {
    const pages = bouchonnerApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <PropertyCalendarPanel propertyId={7} />
      </QueryClientProvider>,
    ));

    const aujourdhui = String(new Date().getDate());
    await waitFor(() => {
      const cellules = screen
        .getAllByRole('gridcell')
        .filter((c) => c.textContent === aujourdhui && c.className.includes('bg-primary/20'));
      expect(cellules).toHaveLength(1);
    });
    expect(pages).toEqual(['1/start_date/100', '2/start_date/100']);
  });
});
