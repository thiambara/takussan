/**
 * TCK-2525 — « Mettre l'agence en avant » : la carte dit le prix et la durée que la plateforme règle,
 * le dialogue lit le devis de l'API (période, prix, solde après) AVANT toute confirmation, paie avec
 * une clé d'idempotence, refuse sans solde, et propose la prochaine disponibilité quand la place est prise.
 *
 * Le réseau est doublé au niveau de `fetch` : les requêtes sont lues telles que l'API les reçoit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

import { MettreLAgenceEnAvant } from '../MettreLAgenceEnAvant';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1, roles: ['agency_admin'] } }) }));
vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({ data: { data: [{ id: 5, name: 'Dakar', slug: 'dakar', region_id: 1 }] }, isLoading: false }),
}));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const REGLAGES = { sale_enabled: true, price_credits: 100, duration_days: 7, max_advance_days: 60, when_taken: 'refuse', sell_directory_wide: false };

interface Appel {
  readonly url: string;
  readonly methode: string;
  readonly corps: unknown;
  readonly entetes: Record<string, string>;
}

function routeur({ solde = 500, prise = false, reglages = REGLAGES }: { solde?: number; prise?: boolean; reglages?: typeof REGLAGES } = {}) {
  const appels: Appel[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(entree));
      const methode = init?.method ?? 'GET';
      appels.push({ url, methode, corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null, entetes: Object.fromEntries(new Headers(init?.headers).entries()) });
      let corps: unknown = {};
      if (url.includes('/api/credits/spotlights/quote')) {
        const jour = /starts_on=([\d-]+)/.exec(url)?.[1];
        const libre = !prise || jour === '2026-12-05';
        corps = {
          data: libre
            ? { available: true, reason: null, starts_at: `${jour ?? '2026-12-01'}T10:00:00+00:00`, ends_at: '2026-12-12T10:00:00+00:00', next_free_at: null, price_credits: 100, balance: solde, balance_after: solde - 100 }
            : { available: false, reason: 'taken', starts_at: null, ends_at: null, next_free_at: '2026-12-05T00:00:00+00:00', price_credits: 100, balance: solde, balance_after: solde - 100 },
        };
      } else if (url.includes('/api/credits/spotlights') && methode === 'POST') {
        corps = { data: { id: 3, geo_city_id: 5, city: { id: 5, name: 'Dakar' }, origin: 'purchased', price_credits: 100, starts_at: '2026-12-01T10:00:00+00:00', ends_at: '2026-12-08T10:00:00+00:00' }, balance: solde - 100 };
      } else if (url.includes('/api/credits/spotlights')) {
        corps = { data: { settings: reglages, balance: solde, spotlights: [] } };
      }
      return { ok: true, status: methode === 'POST' ? 201 : 200, headers: new Headers(), json: async () => corps, text: async () => JSON.stringify(corps) };
    }),
  );
  return appels;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><MettreLAgenceEnAvant /></QueryClientProvider>));
}

async function ouvrirEtChoisirDakar(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole('button', { name: 'Mettre l’agence en avant' }));
  const dialogue = await screen.findByRole('dialog', { name: 'Mettre l’agence en avant' });
  await u.click(within(dialogue).getByLabelText('Ville'));
  await u.click(await screen.findByRole('option', { name: 'Dakar' }));
  return dialogue;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-2525 — mettre l’agence en avant', () => {
  it('dit le prix et la durée que la plateforme règle', async () => {
    routeur({ reglages: { ...REGLAGES, price_credits: 30, duration_days: 3 } });
    rendre();
    expect(await screen.findByText('30 crédits pour 3 jours')).toBeInTheDocument();
  });

  it('lit le devis avant de payer, puis paie avec la ville et une clé d’idempotence', async () => {
    const appels = routeur();
    const u = userEvent.setup();
    rendre();
    const dialogue = await ouvrirEtChoisirDakar(u);

    expect(await within(dialogue).findByText('400 crédits')).toBeInTheDocument();
    await u.click(within(dialogue).getByRole('button', { name: 'Payer 100 crédits' }));

    await waitFor(() => expect(appels.some((a) => a.methode === 'POST')).toBe(true));
    const achat = appels.find((a) => a.methode === 'POST');
    expect(achat?.url).toContain('/api/credits/spotlights');
    expect(achat?.corps).toEqual({ geo_city_id: 5 });
    expect(achat?.entetes['idempotency-key']).toBeTruthy();
    expect(await screen.findByRole('status')).toHaveTextContent('Dakar');
  });

  it('sans solde suffisant : le paiement est fermé et le dit', async () => {
    const appels = routeur({ solde: 60 });
    const u = userEvent.setup();
    rendre();
    const dialogue = await ouvrirEtChoisirDakar(u);

    expect(await within(dialogue).findByText('Votre solde ne couvre pas cet achat.')).toBeInTheDocument();
    expect(within(dialogue).getByRole('button', { name: 'Payer 100 crédits' })).toBeDisabled();
    expect(appels.some((a) => a.methode === 'POST')).toBe(false);
  });

  it('place prise : la prochaine disponibilité se choisit d’un geste', async () => {
    routeur({ prise: true });
    const u = userEvent.setup();
    rendre();
    const dialogue = await ouvrirEtChoisirDakar(u);

    expect(within(dialogue).getByRole('button', { name: 'Payer 100 crédits' })).toBeDisabled();
    await u.click(await within(dialogue).findByRole('button', { name: /^Commencer le/ }));
    await waitFor(() => expect(within(dialogue).getByRole('button', { name: 'Payer 100 crédits' })).toBeEnabled());
  });

  it('vente fermée : aucun bouton d’achat', async () => {
    routeur({ reglages: { ...REGLAGES, sale_enabled: false } });
    rendre();
    expect(await screen.findByText('La mise en avant de l’agence n’est pas en vente pour le moment.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mettre l’agence en avant' })).toBeNull();
  });
});
