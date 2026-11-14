/**
 * TCK-2629 — l'onglet « Exports » de Rapports : cartes prêtes, export personnalisé et « Derniers exports ».
 *
 * - une carte prête est un export comme un autre : son type non permis, elle n'est pas rendue ;
 * - AC1 : « Paiements · Excel », le 2026-11-10, part en `format=xlsx&from=2026-10-01&to=2026-10-31` ;
 * - AC2 : le bailleur n'a que paiements, baux et biens, en cartes comme en formulaire ;
 * - « Refaire » rejoue les mêmes paramètres, sous les capacités d'AUJOURD'HUI.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useCan } from '@/hooks/useCan';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import type { ExportJournalise } from '../useExports';

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: vi.fn() }));

const { ExportsDuRapport } = await import('../ExportsDuRapport');

const T = fr.rapports.exports;
const E = fr.dashboard.exports;

function tenant(capacites: readonly string[]) {
  vi.mocked(useCan).mockImplementation((capability) => ({ can: capacites.includes(capability), isLoading: false }));
}

function journal(lignes: ExportJournalise[]) {
  vi.mocked(useApiQuery).mockReturnValue({ isPending: false, isError: false, data: { data: lignes } } as never);
}

function rendre(ui: ReactElement) {
  const client = new QueryClient();
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return client;
}

const fetchSpy = vi.fn(
  async () => new Response('x', { status: 200, headers: { 'content-disposition': 'attachment; filename="paiements-2026-10.xlsx"' } }),
);
const urls = () => fetchSpy.mock.calls.map((c) => String((c as unknown[])[0]));
const cartes = () => [...document.querySelectorAll('[data-carte]')].map((c) => c.getAttribute('data-carte'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  fetchSpy.mockClear();
  journal([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TCK-2629 — les cartes prêtes', () => {
  it('AC1 — « Paiements · Excel » lance le mois dernier en xlsx, et nomme le fichier comme l’API', async () => {
    tenant(['payments.export', 'reports.export', 'crm.export']);
    const ancre = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const client = rendre(<ExportsDuRapport staff />);
    const relecture = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger Paiements en Excel' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(urls()[0]).toBe('/api/export/payments?format=xlsx&from=2026-10-01&to=2026-10-31');
    await waitFor(() => expect(ancre).toHaveBeenCalled());
    expect((ancre.mock.contexts[0] as HTMLAnchorElement).download).toBe('paiements-2026-10.xlsx');
    expect(document.querySelector('[data-carte="paiements"]')).toHaveTextContent('octobre 2026');
    // « Derniers exports » se relit après le téléchargement : la ligne journalisée par l'API y paraît.
    expect(relecture).toHaveBeenCalledWith({ queryKey: ['me', 'exports'] });
  });

  it('une carte dont le type n’est pas permis n’est pas rendue (payments.export seul)', () => {
    tenant(['payments.export']);
    rendre(<ExportsDuRapport staff />);
    expect(cartes()).toEqual(['paiements']);
  });

  it('le personnel qui tient tout voit les six cartes, dans l’ordre de la maquette', () => {
    tenant(['payments.export', 'reports.export', 'crm.export']);
    rendre(<ExportsDuRapport staff />);
    expect(cartes()).toEqual(['paiements', 'baux', 'balance', 'reversements', 'commissions', 'cautions']);
  });

  it('AC2 — le bailleur : paiements et baux en cartes, et trois types au formulaire, même avec reports.export', () => {
    tenant(['reports.export']);
    rendre(<ExportsDuRapport staff={false} />);
    expect(cartes()).toEqual(['paiements', 'baux']);
    const formulaires = screen.getAllByRole('group', { name: E.dataType });
    for (const g of formulaires) {
      expect(within(g).getAllByRole('button').map((b) => b.textContent)).toEqual([E.entities.payments, E.entities.leases, E.entities.properties]);
    }
  });

  it('sans aucun export permis, rien à télécharger', () => {
    tenant([]);
    rendre(<ExportsDuRapport staff />);
    expect(screen.getByTestId('exports-none')).toHaveTextContent(E.noneAllowed);
    expect(cartes()).toEqual([]);
  });
});

describe('TCK-2629 — « Derniers exports » et « Refaire »', () => {
  const OCTOBRE: ExportJournalise = { at: '2026-11-03T09:00:00Z', entity: 'payouts', format: 'xlsx', filters: { from: '2026-10-01', to: '2026-10-31' }, row_count: 38 };
  const CLIENTS: ExportJournalise = { at: '2026-10-15T09:00:00Z', entity: 'customers', format: 'csv', filters: { from: null, to: null }, row_count: 141 };

  it('« Refaire » rejoue les mêmes paramètres (type, format, période)', async () => {
    tenant(['payments.export', 'reports.export', 'crm.export']);
    journal([OCTOBRE]);
    rendre(<ExportsDuRapport staff />);
    const table = screen.getByRole('table', { name: T.derniers });
    expect(within(table).getByText('Reversements')).toBeInTheDocument();
    expect(within(table).getByText('38')).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: /^Refaire l’export Reversements/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(urls()[0]).toBe('/api/export/payouts?format=xlsx&from=2026-10-01&to=2026-10-31');
  });

  it('un type qui n’est plus permis AUJOURD’HUI n’a pas de « Refaire » (crm.export retiré)', () => {
    tenant(['payments.export', 'reports.export']);
    journal([OCTOBRE, CLIENTS]);
    rendre(<ExportsDuRapport staff />);
    const table = screen.getByRole('table', { name: T.derniers });
    const lignes = within(table).getAllByRole('row').slice(1);
    expect(within(lignes[0]!).getByRole('button', { name: /Refaire/ })).toBeInTheDocument();
    expect(within(lignes[1]!).getByText('Clients')).toBeInTheDocument();
    expect(within(lignes[1]!).queryByRole('button', { name: /Refaire/ })).not.toBeInTheDocument();
  });

  it('un export d’un type que l’onglet ne connaît pas (registre d’« Argent ») est listé sans « Refaire »', () => {
    tenant(['payments.export', 'reports.export', 'crm.export']);
    journal([{ at: '2026-11-01T09:00:00Z', entity: 'payment_history', format: 'csv', filters: { from: null, to: null }, row_count: 12 }]);
    rendre(<ExportsDuRapport staff />);
    const table = screen.getByRole('table', { name: T.derniers });
    expect(within(table).getByText(T.typeInconnu)).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /Refaire/ })).not.toBeInTheDocument();
  });

  it('sans export journalisé, l’onglet le dit', () => {
    tenant(['payments.export']);
    rendre(<ExportsDuRapport staff />);
    expect(screen.getByTestId('exports-derniers-vide')).toHaveTextContent(T.derniersVide);
  });
});
