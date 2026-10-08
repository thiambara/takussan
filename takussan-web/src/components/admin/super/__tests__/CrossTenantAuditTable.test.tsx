import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CrossTenantAuditTable } from '../CrossTenantAuditTable';

/**
 * TCK-601 (F) — l'audit de la console : un préréglage « Gestes sensibles » qui part en
 * `filter[sensitive]=1`, et un export qui reprend les MÊMES filtres puis ouvre le lien signé.
 */

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

const LISTE = {
  data: [{
    id: 1, log_name: 'PersonalDataAccess', event: 'personal_data_viewed', description: null,
    causer_type: 'App\\Models\\User', causer_id: 2, subject_type: 'App\\Models\\User', subject_id: 9,
    properties: null, created_at: '2026-10-01T10:00:00Z',
  }],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 25 },
};

const fetchMock = vi.fn();

function urls(prefixe: string): URL[] {
  return fetchMock.mock.calls
    .map(([u]) => new URL(String(u), 'http://localhost'))
    .filter((u) => u.pathname === prefixe);
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}><CrossTenantAuditTable /></QueryClientProvider>,
  ));
}

beforeEach(() => {
  toastAdd.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (u: string) => {
    if (String(u).startsWith('/api/super-admin/audit/export')) {
      return new Response(JSON.stringify({
        data: { url: 'https://api.test/signed/audit.csv?signature=x', expires_at: '2026-10-08T12:00:00Z', count: 12 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(LISTE), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<CrossTenantAuditTable> — gestes sensibles et export (TCK-601 · F)', () => {
  it('le préréglage « Gestes sensibles » part en filter[sensitive]=1, et « Tout le journal » le retire', async () => {
    const user = userEvent.setup();
    monter();
    await waitFor(() => expect(urls('/api/super-admin/audit').length).toBeGreaterThan(0));
    expect(urls('/api/super-admin/audit').at(-1)!.searchParams.has('filter[sensitive]')).toBe(false);

    const sensibles = screen.getByRole('button', { name: 'Gestes sensibles' });
    expect(sensibles).toHaveAttribute('aria-pressed', 'false');
    await user.click(sensibles);

    await waitFor(() => expect(
      urls('/api/super-admin/audit').at(-1)!.searchParams.get('filter[sensitive]'),
    ).toBe('1'));
    expect(screen.getByRole('button', { name: 'Gestes sensibles' })).toHaveAttribute('aria-pressed', 'true');

    // Retour au journal entier : la page sans filtre est déjà en cache (même clé de requête),
    // React Query la resservira sans rappeler l'API — on juge donc l'état affiché.
    await user.click(screen.getByRole('button', { name: 'Tout le journal' }));
    expect(screen.getByRole('button', { name: 'Tout le journal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gestes sensibles' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Consultations de données personnelles/)).not.toBeInTheDocument();
  });

  it('l’export reprend les filtres affichés, ouvre le lien signé et dit combien d’entrées', async () => {
    const clics: string[] = [];
    const origine = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clic(this: HTMLAnchorElement) { clics.push(this.href); };

    try {
      const user = userEvent.setup();
      monter();
      await user.click(screen.getByRole('button', { name: 'Gestes sensibles' }));
      await user.click(screen.getByRole('button', { name: 'Exporter (CSV)' }));

      await waitFor(() => expect(urls('/api/super-admin/audit/export')).toHaveLength(1));
      const exportUrl = urls('/api/super-admin/audit/export')[0];
      expect(exportUrl.searchParams.get('filter[sensitive]')).toBe('1');
      // Ni pagination ni `include` : l'export porte des filtres, pas une page.
      expect(exportUrl.searchParams.has('page')).toBe(false);

      await waitFor(() => expect(clics).toEqual(['https://api.test/signed/audit.csv?signature=x']));
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export prêt : 12 entrées', type: 'success' }));
    } finally {
      HTMLAnchorElement.prototype.click = origine;
    }
  });

  it('un export refusé le dit, sans rien ouvrir', async () => {
    fetchMock.mockImplementation(async (u: string) => (
      String(u).startsWith('/api/super-admin/audit/export')
        ? new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
        : new Response(JSON.stringify(LISTE), { status: 200 })
    ));
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Exporter (CSV)' }));
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'L\'export du journal a échoué', type: 'error' }),
    ));
  });
});
