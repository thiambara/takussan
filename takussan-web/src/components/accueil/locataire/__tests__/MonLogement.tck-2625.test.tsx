import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

import { MonLogement } from '../MonLogement';

/** TCK-2625 — « Mon logement » : le bien, l'agence, et les trois gestes du locataire. */
const reseau = vi.hoisted(() => ({
  appels: [] as string[],
  bail: null as unknown,
  payes: [] as unknown[],
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, roles: ['customer', 'tenant'] }, token: 'jeton' }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string) => {
      const lu = decodeURIComponent(path);
      reseau.appels.push(lu);
      if (lu === '/api/me/rent-summary') {
        return { data: { currency: 'XOF', total_due: 0, parts: { payable_online: 0, payable_at_agency: 0 }, items: [], next_rent: null, schedule_state: reseau.bail ? 'up_to_date' : null, lease: reseau.bail, offline_payment: null } };
      }
      if (lu.startsWith('/api/payments/history?')) return { data: reseau.payes, meta: { total: reseau.payes.length, current_page: 1, last_page: 1, per_page: 3 } };
      throw new Error(`requête inattendue : ${lu}`);
    }),
  };
});

const BAIL = {
  id: 40,
  reference_number: 'BAIL-40',
  status: 'active',
  monthly_rent: 250_000,
  monthly_charges: 0,
  currency: 'XOF',
  property: { id: 7, title: 'Appartement F3 · Sacré-Cœur 3' },
  agency: { id: 1, name: 'Dakar Immo', phone: '+221338201234' },
};

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<MonLogement />}</QueryClientProvider>));
}

describe('MonLogement — TCK-2625', () => {
  const fetchOrigine = globalThis.fetch;

  beforeEach(() => {
    reseau.appels = [];
    reseau.bail = BAIL;
    // Trois pénalités et une caution réglées après le loyer : la quittance reste trouvée (dix lignes lues).
    reseau.payes = [
      { source: 'lease', id: 700, lease_id: 40, payment_type: 'deposit', status: 'paid', paid_at: '2026-11-08T10:00:00Z', period_start: null, reference_number: 'DEP-1' },
      { source: 'lease', id: 710, lease_id: 40, payment_type: 'late_fee', status: 'paid', paid_at: '2026-11-07T10:00:00Z', period_start: null, reference_number: 'PEN-1' },
      { source: 'lease', id: 711, lease_id: 40, payment_type: 'late_fee', status: 'paid', paid_at: '2026-11-07T09:00:00Z', period_start: null, reference_number: 'PEN-2' },
      { source: 'lease', id: 712, lease_id: 40, payment_type: 'late_fee', status: 'paid', paid_at: '2026-11-06T10:00:00Z', period_start: null, reference_number: 'PEN-3' },
      { source: 'lease', id: 701, lease_id: 40, payment_type: 'rent', status: 'paid', paid_at: '2026-11-05T10:00:00Z', period_start: '2026-11-01', reference_number: 'LOY-11' },
    ];
  });

  afterEach(() => {
    globalThis.fetch = fetchOrigine;
  });

  it('le bien et l’agence, puis « Signaler un problème », « Dernière quittance » (le loyer payé, jamais la caution) et « Contacter l’agence »', async () => {
    monter();
    expect(await screen.findByText('Appartement F3 · Sacré-Cœur 3')).toBeTruthy();
    expect(screen.getByText('Géré par Dakar Immo')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Signaler un problème/ }).getAttribute('href')).toBe('/app/maintenance/new');
    const quittance = await screen.findByRole('button', { name: /Dernière quittance/ });
    expect(quittance.textContent).toContain('Novembre · payé le 5 nov.');
    expect(screen.getByRole('link', { name: /Contacter l’agence/ }).getAttribute('href')).toBe('tel:+221338201234');
    const lecture = reseau.appels.find((a) => a.startsWith('/api/payments/history?'));
    expect(lecture).toContain('filter[status]=paid');
    expect(lecture).toContain('per_page=10');
  });

  it('« Dernière quittance » télécharge le PDF de CETTE échéance', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    monter();
    fireEvent.click(await screen.findByRole('button', { name: /Dernière quittance/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/leases\/40\/receipts\/701\/pdf$/);
  });

  it('sans loyer payé : pas de « Dernière quittance » ; sans téléphone joignable : pas de « Contacter l’agence »', async () => {
    reseau.payes = reseau.payes.filter((r) => (r as { payment_type: string }).payment_type !== 'rent');
    reseau.bail = { ...BAIL, agency: { ...BAIL.agency, phone: null } };
    monter();
    await screen.findByText('Appartement F3 · Sacré-Cœur 3');
    await waitFor(() => expect(reseau.appels.some((a) => a.startsWith('/api/payments/history?'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /Dernière quittance/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Contacter l’agence/ })).toBeNull();
  });

  it('sans bail : rien', async () => {
    reseau.bail = null;
    const { container } = monter();
    await waitFor(() => expect(reseau.appels).toContain('/api/me/rent-summary'));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-slot="mon-logement"]')).toBeNull();
  });
});
