import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { ExportForm } from '../ExportForm';

/**
 * TCK-1308 (piste P112.03) — un export coupé au plafond le dit à l'écran. Le formulaire télécharge
 * par le relais et lit `X-Export-Truncated` ; il ouvrait un onglet, d'où aucun en-tête ne se lit.
 */
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

const T = fr.dashboard.exports;

function reponse(enTetes: Record<string, string>, status = 200) {
  return vi.fn(async () => new Response('id\n1\n', { status, headers: { 'content-type': 'text/csv', ...enTetes } }));
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExportForm — coupure signalée (TCK-1308)', () => {
  it('dit que le fichier est coupé, et à combien de lignes', async () => {
    const fetchSpy = reponse({ 'x-export-truncated': '5000', 'content-disposition': 'attachment; filename="payments-1.csv"' });
    vi.stubGlobal('fetch', fetchSpy);
    render(withIntl(<ExportForm staff />));

    fireEvent.click(screen.getByRole('button', { name: T.download }));

    expect(await screen.findByTestId('exports-truncated')).toHaveTextContent(/5\s000 lignes/);
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('/api/export/payments?format=csv');
  });

  it('ne dit rien quand l’export est entier', async () => {
    const fetchSpy = reponse({});
    vi.stubGlobal('fetch', fetchSpy);
    render(withIntl(<ExportForm staff />));

    fireEvent.click(screen.getByRole('button', { name: T.download }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: T.download })).toBeEnabled());
    expect(screen.queryByTestId('exports-truncated')).not.toBeInTheDocument();
  });

  it('dit l’échec d’un téléchargement refusé', async () => {
    vi.stubGlobal('fetch', reponse({}, 403));
    render(withIntl(<ExportForm staff />));

    fireEvent.click(screen.getByRole('button', { name: T.download }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.failed);
  });
});
