/**
 * TCK-2868 — l'onglet « Exports » de Rapports, après TCK-2866 (ADR-0115) :
 *
 * - AC4 : un export dont le fichier est gardé porte « Retélécharger » (`GET /api/me/exports/{id}/download`) ;
 *   un export expiré porte « Refaire » ; un 410 au retéléchargement le dit et relit la liste ;
 * - AC5 : « Trimestre » pose les dates du trimestre courant, « Autre… » existe, et la phrase dit
 *   « 38 lignes à exporter. » quand `GET /api/export/{entity}/count` en sert 38 ; au-delà du plafond, refus.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useApiQuery } from '@/hooks/useApiQuery';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import type { ExportJournalise } from '../useExports';

vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: vi.fn() }));

const { ExportsDuRapport } = await import('../ExportsDuRapport');

const T = fr.rapports.exports;

let journal: ExportJournalise[] = [];
let compte: { count: number; limit: number } = { count: 38, limit: 5000 };
const lectures: { chemin: string; params: unknown }[] = [];

function rendre(ui: ReactElement) {
  const client = new QueryClient();
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return client;
}

const fetchSpy = vi.fn(async (_url: string) => new Response('x', { status: 200 }));

const ligne = (extra: Partial<ExportJournalise>): ExportJournalise => ({
  id: 41,
  at: '2026-11-08T09:00:00Z',
  entity: 'payments',
  format: 'xlsx',
  filters: { from: '2026-10-01', to: '2026-10-31' },
  row_count: 38,
  file: { available: true, expires_at: '2026-11-15T09:00:00Z' },
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => new Response('x', { status: 200 }));
  lectures.length = 0;
  journal = [];
  compte = { count: 38, limit: 5000 };
  vi.mocked(useApiQuery).mockImplementation(((_cle: unknown, chemin: string, options?: { params?: { extra?: unknown } }) => {
    lectures.push({ chemin, params: options?.params?.extra });
    if (chemin === '/api/me/exports') return { isPending: false, isError: false, data: { data: journal } };
    if (chemin.endsWith('/count')) return { isPending: false, isError: false, data: { data: compte } };
    return { isPending: true, isError: false, data: undefined };
  }) as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tableau = () => screen.getByRole('table', { name: T.derniers });

describe('TCK-2868 — « Retélécharger » un export gardé', () => {
  it('AC4 — un export de 2 jours porte « Retélécharger » ; un export expiré porte « Refaire »', () => {
    journal = [
      ligne({ id: 41 }),
      ligne({ id: 40, at: '2026-11-01T09:00:00Z', file: { available: false, expires_at: '2026-11-08T09:00:00Z' } }),
    ];
    rendre(<ExportsDuRapport staff />);
    const [, recent, expire] = within(tableau()).getAllByRole('row');
    expect(within(recent!).getByRole('button', { name: /^Retélécharger l’export Paiements/ })).toHaveTextContent(T.retelecharger);
    expect(within(recent!).queryByRole('button', { name: /Refaire/ })).toBeNull();
    expect(within(expire!).getByRole('button', { name: /^Refaire l’export Paiements/ })).toBeInTheDocument();
    expect(within(expire!).queryByRole('button', { name: /Retélécharger/ })).toBeNull();
  });

  it('AC4 — « Retélécharger » appelle le téléchargement du fichier gardé, pas un nouvel export', async () => {
    journal = [ligne({ id: 41 })];
    fetchSpy.mockImplementation(
      async () => new Response('x', { status: 200, headers: { 'content-disposition': 'attachment; filename="paiements-2026-10.xlsx"' } }),
    );
    const ancre = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    rendre(<ExportsDuRapport staff />);
    fireEvent.click(within(tableau()).getByRole('button', { name: /^Retélécharger/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    // Par le relais du BFF (cookie de session), jamais un nouvel export `/api/export/…`.
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('/api/me/exports/41/download');
    await waitFor(() => expect(ancre).toHaveBeenCalled());
    expect((ancre.mock.contexts[0] as HTMLAnchorElement).download).toBe('paiements-2026-10.xlsx');
  });

  it('un 410 (fichier expiré entre-temps) le dit et relit « Derniers exports »', async () => {
    journal = [ligne({ id: 41 })];
    fetchSpy.mockImplementation(async () => new Response('{}', { status: 410 }));
    const client = rendre(<ExportsDuRapport staff />);
    const relecture = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(within(tableau()).getByRole('button', { name: /^Retélécharger/ }));
    expect(await screen.findByTestId('retelechargement-issue')).toHaveTextContent(T.retelechargerExpire);
    expect(relecture).toHaveBeenCalledWith({ queryKey: ['me', 'exports'] });
  });

  it('le pied ne dit plus « aucun fichier n’est conservé » : il dit les 7 jours', () => {
    journal = [ligne({})];
    rendre(<ExportsDuRapport staff />);
    expect(screen.getByText(/pendant 7 jours/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucun fichier n’est conservé/)).toBeNull();
  });
});

describe('TCK-2868 — l’export personnalisé : Trimestre, Autre…, et le nombre de lignes', () => {
  const formulaire = () => screen.getByRole('region', { name: T.personnalise }) as HTMLElement;

  it('AC5 — « Trimestre » pose le trimestre courant ; la phrase dit « 38 lignes à exporter. » lue de `count`', async () => {
    rendre(<ExportsDuRapport staff />);
    const zone = formulaire();
    const puces = within(within(zone).getByRole('group', { name: T.periode })).getAllByRole('button').map((b) => b.textContent).slice(0, 5);
    expect(puces).toEqual(['Ce mois', 'Mois dernier', 'Trimestre', 'Année 2026', 'Autre…']);
    fireEvent.click(within(zone).getByRole('button', { name: 'Trimestre' }));
    expect(within(zone).getByRole('button', { name: 'Trimestre' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(lectures).toContainEqual({ chemin: '/api/export/payments/count', params: { format: 'xlsx', from: '2026-10-01', to: '2026-12-31' } }),
    );
    await waitFor(() =>
      expect(within(zone).getByTestId('exports-row-cap').textContent).toMatch(/^38 lignes à exporter\. 5\s000 lignes au plus par export, 200 en PDF\.$/u),
    );
  });

  it('« Autre… » s’allume sans changer les dates', () => {
    rendre(<ExportsDuRapport staff />);
    const zone = formulaire();
    fireEvent.click(within(zone).getByRole('button', { name: 'Autre…' }));
    expect(within(zone).getByRole('button', { name: 'Autre…' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(zone).getByRole('button', { name: 'Mois dernier' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('au-delà du plafond du format, l’export est refusé à l’écran', async () => {
    compte = { count: 6200, limit: 5000 };
    rendre(<ExportsDuRapport staff />);
    const zone = formulaire();
    await waitFor(() => expect(within(zone).getByTestId('exports-row-cap').textContent).toMatch(/6\s200 lignes à exporter : c’est plus que les 5\s000/u));
    expect(within(zone).getByRole('button', { name: T.telechargerLExport })).toBeDisabled();
  });
});
