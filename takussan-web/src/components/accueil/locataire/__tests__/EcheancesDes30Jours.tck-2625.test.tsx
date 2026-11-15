import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

import { EcheancesDes30Jours, echeancesDes30Jours } from '../EcheancesDes30Jours';

/**
 * TCK-2625 (AC4, décision 6) — « Échéances des 30 prochains jours » lit les dus, comme la carte « Loyer » :
 * le reste à payer, jamais le brut ; jamais une restitution de caution.
 */
const reseau = vi.hoisted(() => ({ appels: [] as string[], dus: [] as unknown[], echec: false }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, roles: ['customer', 'tenant'] }, token: 'jeton' }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string) => {
      const lu = decodeURIComponent(path);
      reseau.appels.push(lu);
      if (lu.startsWith('/api/payments/history?')) {
        if (reseau.echec) throw new reel.ApiError(500, { message: 'panne' });
        return { data: reseau.dus, meta: { total: reseau.dus.length, current_page: 1, last_page: 1, per_page: 50 } };
      }
      throw new Error(`requête inattendue : ${lu}`);
    }),
  };
});

function ligne(p: Partial<PaymentHistoryRow>): PaymentHistoryRow {
  return {
    source: 'lease', id: 1, reference_number: null, amount: 250_000, currency: 'XOF', payment_method: null, payment_type: 'rent',
    status: 'pending', paid_amount: 0, remaining_amount: 250_000, date: null, paid_at: null, due_date: '2026-12-05',
    booking_id: null, lease_id: 40, property_id: 7, customer_id: 3, created_at: null, ...p,
  } as PaymentHistoryRow;
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<EcheancesDes30Jours />}</QueryClientProvider>));
}

describe('echeancesDes30Jours — TCK-2625', () => {
  const AUJOURDHUI = '2026-11-13';

  it('garde les dus de bail d’aujourd’hui à J+30, triés par échéance', () => {
    const retenues = echeancesDes30Jours(
      [
        ligne({ id: 2, due_date: '2026-12-13' }),
        ligne({ id: 1, due_date: '2026-11-13' }),
        ligne({ id: 3, due_date: '2026-12-14' }),
        ligne({ id: 4, due_date: '2026-11-12' }),
      ],
      AUJOURDHUI,
    );
    expect(retenues.map((r) => r.id)).toEqual([1, 2]);
  });

  it('écarte la restitution de caution, la réservation et la ligne soldée', () => {
    const retenues = echeancesDes30Jours(
      [
        ligne({ id: 1, payment_type: 'deposit_refund' }),
        ligne({ id: 2, source: 'booking', lease_id: null }),
        ligne({ id: 3, remaining_amount: 0 }),
        ligne({ id: 4 }),
      ],
      AUJOURDHUI,
    );
    expect(retenues.map((r) => r.id)).toEqual([4]);
  });
});

describe('EcheancesDes30Jours — TCK-2625', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T09:00:00Z'));
    reseau.appels = [];
    reseau.echec = false;
    reseau.dus = [
      ligne({ id: 501, amount: 250_000, paid_amount: 100_000, remaining_amount: 150_000, status: 'partially_paid' }),
      ligne({ id: 502, payment_type: 'deposit_refund', amount: 500_000, remaining_amount: 500_000, due_date: '2026-11-20' }),
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('le reste à payer d’une échéance payée à moitié, jamais son brut ; la restitution de caution absente', async () => {
    monter();
    const lignes = await screen.findAllByText((_, n) => n?.getAttribute('data-slot') === 'echeance-a-venir');
    expect(lignes).toHaveLength(1);
    // Les montants formatés portent une espace fine insécable : on lit le texte normalisé.
    const texte = lignes[0]!.textContent!.replace(/\s/g, ' ');
    expect(texte).toContain('150 000 F');
    expect(texte).not.toContain('250 000');
    expect(document.body.textContent!.replace(/\s/g, ' ')).not.toContain('500 000');
  });

  it('lit les MÊMES dus que la carte « Loyer » : statuts dus filtrés par l’API', async () => {
    monter();
    await waitFor(() => expect(reseau.appels.some((a) => a.startsWith('/api/payments/history?'))).toBe(true));
    expect(reseau.appels[0]).toContain('filter[status]=pending,partially_paid,late,failed');
  });

  it('en échec : l’erreur du bloc, avec « Réessayer »', async () => {
    reseau.echec = true;
    monter();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });
});
