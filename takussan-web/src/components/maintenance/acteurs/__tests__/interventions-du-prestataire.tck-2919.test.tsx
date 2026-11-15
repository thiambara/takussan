import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InterventionsDuPrestataire } from '../InterventionsDuPrestataire';

/**
 * TCK-2919 (ADR-0120 § 1-2) — chez le prestataire : « À facturer · n » et « Facturer » (`POST
 * …/submit`), « Calendrier » vers l'agenda, « Relevé de mes factures » (`…/statement/pdf` avec la
 * période) et le sous-titre compté. La couche RÉSEAU est doublée (`apiRequest`, `fetch` du PDF).
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { path: string; method: string; body?: unknown }[],
  brouillons: [] as Record<string, unknown>[],
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 18, roles: ['service_provider'] }, token: 'jeton' }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? 'GET';
      const lu = decodeURIComponent(path);
      reseau.appels.push({ path: lu, method, body: options.body });
      const page = (data: unknown[]) => ({ data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } });
      const soumise = lu.match(/^\/api\/service-provider-bills\/(\d+)\/submit$/);
      if (method === 'POST' && soumise) {
        // L'API fait passer la facture `pending_validation` : elle quitte les brouillons.
        reseau.brouillons = reseau.brouillons.filter((b) => b.id !== Number(soumise[1]));
        return { data: { id: Number(soumise[1]), status: 'pending_validation' } };
      }
      if (lu.startsWith('/api/maintenance-requests?')) {
        if (lu.includes('filter[file]=a_accepter')) return page([{ id: 52, title: 'Fuite sous l’évier', status: 'assigned', priority: 'normal', scheduled_at: null, property: { id: 7, title: 'Villa', slug: null } }]);
        return page([]);
      }
      if (/^\/api\/maintenance-requests\/\d+/.test(lu)) return { data: { id: 52, abilities: {} } };
      if (lu.startsWith('/api/service-provider-bills?')) {
        if (lu.includes('filter[status]=draft')) return page(reseau.brouillons);
        return page([]);
      }
      throw new Error(`requête inattendue : ${method} ${lu}`);
    }),
  };
});

const BROUILLONS = [
  { id: 71, reference_number: 'SPB-202611-AAAA1111', amount: 485000, currency: 'XOF', status: 'draft', created_at: '2026-11-09T15:00:00Z', validated_at: null, maintenance_request: { id: 41, title: 'Chasse d’eau qui fuit' }, property: { id: 3, title: 'Sacré-Cœur 3' } },
  { id: 72, reference_number: 'SPB-202611-BBBB2222', amount: 65000, currency: 'XOF', status: 'draft', created_at: '2026-11-06T11:00:00Z', validated_at: null, maintenance_request: { id: 44, title: 'Joint de baignoire' }, property: { id: 9, title: 'Mermoz' } },
];

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<InterventionsDuPrestataire />}</QueryClientProvider>));
}

async function section() {
  return (await waitFor(() => {
    const s = document.querySelector('[data-slot="a-facturer"]');
    if (!s) throw new Error('« À facturer » absent');
    return s;
  })) as HTMLElement;
}

describe('InterventionsDuPrestataire — TCK-2919', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    reseau.appels = [];
    reseau.brouillons = [...BROUILLONS];
  });

  it('AC3 — deux brouillons : « À facturer · 2 », FILTRÉS par l’API ; chaque ligne nomme le bien et le jour de fin', async () => {
    monter();
    const s = await section();
    expect(within(s).getByRole('heading', { name: 'À facturer · 2' })).toBeTruthy();
    const lignes = s.querySelectorAll('[data-slot="ligne-a-facturer"]');
    expect(lignes).toHaveLength(2);
    expect(lignes[0].textContent).toContain('Chasse d’eau qui fuit');
    expect(lignes[0].textContent).toContain('Sacré-Cœur 3 · terminée hier');
    expect(lignes[1].textContent).toMatch(/Mermoz · terminée le 6 nov/);
    const requete = reseau.appels.find((a) => a.path.includes('filter[status]=draft'));
    expect(requete?.path).toContain('filter[provider_id]=18');
    // « Mes factures » ne reprend pas le brouillon.
    const mesFactures = reseau.appels.find((a) => a.path.startsWith('/api/service-provider-bills?') && a.path.includes('per_page=5'));
    expect(mesFactures?.path).toContain('filter[status]=pending_validation,validated,paid,rejected,cancelled');
  });

  it('AC3 — « Facturer » : montant prérempli du brouillon, saisi, envoyé en POST …/submit ; la section passe à « À facturer · 1 »', async () => {
    monter();
    const s = await section();
    fireEvent.click(within(s).getByRole('button', { name: 'Facturer « Chasse d’eau qui fuit »' }));
    const montant = (await screen.findByLabelText('Montant final (XOF)')) as HTMLInputElement;
    expect(montant.value).toBe('485000');
    fireEvent.change(montant, { target: { value: '490 000' } });
    fireEvent.change(screen.getByLabelText('Votre numéro de facture (facultatif)'), { target: { value: 'F-2026-031' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la facture' }));

    await waitFor(() => expect(reseau.appels.some((a) => a.method === 'POST')).toBe(true));
    const envoi = reseau.appels.find((a) => a.method === 'POST');
    expect(envoi?.path).toBe('/api/service-provider-bills/71/submit');
    const corps = envoi?.body as FormData;
    expect(corps.get('amount')).toBe('490000');
    expect(corps.get('provider_reference')).toBe('F-2026-031');
    expect(await screen.findByRole('heading', { name: 'À facturer · 1' })).toBeTruthy();
  });

  it('un montant vide ou nul ne part pas', async () => {
    monter();
    const s = await section();
    fireEvent.click(within(s).getByRole('button', { name: 'Facturer « Joint de baignoire »' }));
    const montant = await screen.findByLabelText('Montant final (XOF)');
    fireEvent.change(montant, { target: { value: '0' } });
    expect((screen.getByRole('button', { name: 'Envoyer la facture' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sans brouillon, pas de section « À facturer »', async () => {
    reseau.brouillons = [];
    monter();
    await screen.findByText(/— 1 à accepter/);
    expect(document.querySelector('[data-slot="a-facturer"]')).toBeNull();
  });

  it('AC5 — le sous-titre compte « 1 à accepter, aucune prévue, 2 à facturer » depuis les données servies', async () => {
    monter();
    expect(await screen.findByText('Semaine du 9 au 14 novembre — 1 à accepter, aucune prévue, 2 à facturer')).toBeTruthy();
  });

  it('AC4 — « Cette semaine » porte « Calendrier », vers l’agenda en semaine sur ses interventions', async () => {
    monter();
    const lien = await screen.findByRole('link', { name: 'Calendrier' });
    expect(lien.getAttribute('href')).toBe('/app/calendar?view=week&types=maintenance');
  });

  it('AC4 — « Relevé de mes factures » télécharge le relevé de la période choisie (mois en cours par défaut)', async () => {
    const recu: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      recu.push(url);
      return new Response(new Blob(['%PDF']), { status: 200 });
    }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Relevé de mes factures' }));
    const courant = await screen.findByRole('button', { name: 'Novembre 2026 (mois en cours)' });
    expect(courant.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le relevé' }));
    await waitFor(() => expect(recu).toHaveLength(1));
    expect(recu[0]).toMatch(/\/api\/service-provider-bills\/statement\/pdf\?from=2026-11-01&to=2026-11-30$/);

    fireEvent.click(screen.getByRole('button', { name: 'Relevé de mes factures' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Octobre 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le relevé' }));
    await waitFor(() => expect(recu).toHaveLength(2));
    expect(recu[1]).toMatch(/from=2026-10-01&to=2026-10-31$/);
  });
});
