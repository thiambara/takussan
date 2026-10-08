/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance du bailleur : ce qui a été encaissé, retenu, versé,
 * pour un mois ou pour l'année. Le PDF part avec le jeton de session — l'URL seule rendrait 401.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { OwnerStatementPanel } from '../OwnerStatementPanel';

const PERIODES = vi.hoisted(() => [] as string[]);
const REPONSE = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  error: null,
  data: {
    data: {
      period: '2026-09',
      annual: false,
      currency: 'XOF',
      totals: { gross: 220000, commission: 22000, fees: 15000, net: 183000, paid_out: 183000 },
      payouts: [],
    },
  },
}));
vi.mock('@/lib/queries/payments', () => ({
  useOwnerStatement: (period: string) => {
    PERIODES.push(period);
    return REPONSE;
  },
}));
const AUTH = vi.hoisted(() => ({ token: 'jeton-de-session' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));

const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]/g, '');

describe('OwnerStatementPanel — le relevé à côté des versements (TCK-594)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    PERIODES.length = 0;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:releve');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lit le net et ce qui a été retenu, et passe à l’année sur demande', () => {
    render(withIntl(<OwnerStatementPanel />));

    const net = screen.getByText('Net').nextElementSibling;
    expect(sansEspaces(net?.textContent)).toBe('183000FCFA');
    expect(PERIODES.at(-1)).toMatch(/^\d{4}-\d{2}$/);

    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-09' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Toute l'année/ }));

    expect(PERIODES.at(-1)).toBe('2026');
  });

  it('télécharge le PDF avec le jeton de session', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 }));
    render(withIntl(<OwnerStatementPanel />));
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-09' } });

    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/owner-statements\/pdf\?period=2026-09$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-de-session');
  });

  it('dit pourquoi le téléchargement échoue', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Ce relevé ne vous est pas ouvert.', code: 'http.forbidden' }), { status: 403 }),
    );
    render(withIntl(<OwnerStatementPanel />));

    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce relevé ne vous est pas ouvert.');
  });
});
