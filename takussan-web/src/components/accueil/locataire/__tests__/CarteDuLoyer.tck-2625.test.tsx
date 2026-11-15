import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { ResumeDuLoyer } from '@/types/invoice';

import { CarteDuLoyer } from '../CarteDuLoyer';

/**
 * TCK-2625 — la carte « Loyer » de l'accueil du locataire. La couche RÉSEAU est doublée : AC1 se
 * prouve sur l'identifiant de l'échéance que « Payer » ouvre (la requête des fournisseurs).
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { path: string; method: string }[],
  resume: null as unknown,
  dus: [] as unknown[],
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, roles: ['customer', 'tenant'] }, token: 'jeton' }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string } = {}) => {
      const method = options.method ?? 'GET';
      const lu = decodeURIComponent(path);
      reseau.appels.push({ path: lu, method });
      if (lu === '/api/me/rent-summary') return { data: reseau.resume };
      if (lu.startsWith('/api/payments/history?')) return { data: reseau.dus, meta: { total: reseau.dus.length, current_page: 1, last_page: 1, per_page: 50 } };
      if (/^\/api\/lease-payments\/\d+\/providers$/.test(lu)) return { data: { providers: ['wave', 'orange_money'] } };
      throw new Error(`requête inattendue : ${method} ${lu}`);
    }),
  };
});

const ligne = { kind: 'rent', lease_payment_id: 501, lease_id: 40, payment_type: 'rent', due_date: '2026-12-05', period_start: '2026-12-01', period_end: '2026-12-31', amount: 150_000, currency: 'XOF', days_late: 0, payable_online: true };

function resume(surcharge: Partial<ResumeDuLoyer> = {}): ResumeDuLoyer {
  return {
    currency: 'XOF',
    total_due: 150_000,
    parts: { payable_online: 150_000, payable_at_agency: 0 },
    items: [ligne],
    next_rent: null,
    schedule_state: 'due',
    lease: null,
    offline_payment: null,
    ...surcharge,
  };
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<CarteDuLoyer />}</QueryClientProvider>));
}

const carte = () => waitFor(() => {
  const c = document.querySelector<HTMLElement>('[data-slot="carte-du-loyer"]:not([data-etat="chargement"])');
  if (!c) throw new Error('carte absente');
  return c;
});

describe('CarteDuLoyer — TCK-2625', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-05T08:00:00Z'));
    reseau.appels = [];
    reseau.resume = resume();
    // La ligne de l'historique : 250 000 F dont 100 000 F payés.
    reseau.dus = [{ source: 'lease', id: 501, lease_id: 40, amount: 250_000, amount_due: 150_000, remaining_amount: 150_000, late_fee_outstanding: 0, late_fee_payable_online: false, currency: 'XOF', period_start: '2026-12-01', due_date: '2026-12-05', status: 'partially_paid' }];
  });

  it('AC1 — 250 000 F dont 100 000 F payés : la carte dit 150 000 F, et « Payer » ouvre le parcours sur CETTE échéance', async () => {
    monter();
    const c = await carte();
    expect(c.querySelector('[data-testid="montant-du-loyer"]')?.textContent).toMatch(/150\s000/);
    expect(c.textContent).not.toMatch(/250\s000/);
    expect(c.textContent).toContain('Loyer de décembre');
    fireEvent.click(screen.getByRole('button', { name: 'Payer' }));
    await waitFor(() => expect(reseau.appels.some((a) => a.path === '/api/lease-payments/501/providers')).toBe(true));
    expect(await screen.findByTestId('total-debite')).toBeTruthy();
    expect(screen.getByTestId('total-debite').textContent).toMatch(/150\s000/);
  });

  it('AC2 — en retard de 4 jours : « En retard de 4 jours » en ton d’alerte, et « Payer » reste', async () => {
    reseau.resume = resume({ items: [{ ...ligne, due_date: '2026-12-01', days_late: 4 }] });
    monter();
    const c = await carte();
    expect(c.getAttribute('data-ton')).toBe('alerte');
    expect(c.textContent).toContain('En retard de 4 jours');
    expect(screen.getByRole('button', { name: 'Payer' })).toBeTruthy();
  });

  it('AC3 — seule une restitution de caution à venir (aucun loyer) : aucune carte « à payer », ni montant ni « Payer »', async () => {
    reseau.resume = resume({ schedule_state: 'up_to_date', total_due: 0, items: [], next_rent: null, parts: { payable_online: 0, payable_at_agency: 0 } });
    monter();
    const c = await carte();
    expect(c.getAttribute('data-etat')).toBe('a-jour');
    expect(c.textContent).toContain('Vous êtes à jour');
    expect(c.textContent).not.toMatch(/à payer/);
    expect(c.querySelector('[data-testid="montant-du-loyer"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Payer' })).toBeNull();
  });

  it('« Payer » absent sur une échéance non payable en ligne : « Comment payer à l’agence » à la place', async () => {
    reseau.resume = resume({ items: [{ ...ligne, payable_online: false }], parts: { payable_online: 0, payable_at_agency: 150_000 } });
    monter();
    await carte();
    expect(screen.queryByRole('button', { name: 'Payer' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Comment payer à l’agence' }).getAttribute('href')).toBe('/app/payments?moyen=agence');
  });

  it('à jour avec un prochain loyer payable en ligne : le loyer de décembre, « dans N jours », « Payer » sur le prochain loyer', async () => {
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    reseau.resume = resume({
      schedule_state: 'up_to_date',
      total_due: 0,
      items: [],
      parts: { payable_online: 0, payable_at_agency: 0 },
      next_rent: { lease_id: 40, lease_payment_id: 600, due_date: '2026-12-05', amount: 250_000, charges_amount: 0, currency: 'XOF', payable_online: true },
    });
    monter();
    const c = await carte();
    expect(c.textContent).toContain('Loyer de décembre');
    expect(c.textContent).toContain('à payer avant le 5 décembre · dans 25 jours');
    fireEvent.click(screen.getByRole('button', { name: 'Payer' }));
    await waitFor(() => expect(reseau.appels.some((a) => a.path === '/api/lease-payments/600/providers')).toBe(true));
  });

  it('plusieurs échéances dues : « À régler », le total de l’API, et « Voir le détail » vers Paiements', async () => {
    reseau.resume = resume({ total_due: 211_500, items: [ligne, { ...ligne, kind: 'late_fee', lease_payment_id: 450, amount: 61_500, payable_online: false }] });
    monter();
    const c = await carte();
    expect(c.textContent).toContain('À régler');
    expect(c.querySelector('[data-testid="montant-du-loyer"]')?.textContent).toMatch(/211\s500/);
    expect(screen.getByRole('link', { name: '2 échéances · Voir le détail' }).getAttribute('href')).toBe('/app/payments');
  });

  it('sans bail (client de réservation) : pas de carte', async () => {
    reseau.resume = resume({ schedule_state: null, total_due: 0, items: [] });
    const { container } = monter();
    await waitFor(() => expect(reseau.appels.some((a) => a.path === '/api/me/rent-summary')).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(container.querySelector('[data-slot="carte-du-loyer"]')).toBeNull());
  });
});
