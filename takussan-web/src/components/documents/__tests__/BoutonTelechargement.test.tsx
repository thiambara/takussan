/**
 * TCK-593 (Partie 1, AC1) — un document protégé se télécharge depuis l'ORIGINE DE L'API, avec le
 * jeton de session.
 *
 * Le défaut corrigé : `<a href="/api/leases/{id}/contract/pdf">` et `<a href="/api/booking-payments/
 * {id}/receipt">` étaient relatifs. Ils frappaient l'origine Next (404, aucune de ces routes n'y
 * existe) et n'auraient de toute façon porté aucun `Bearer`. Les tests ci-dessous rougissent si
 * l'URL redevient relative ou si le jeton disparaît.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { BoutonTelechargement } from '../BoutonTelechargement';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton-593' }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rendre() {
  return render(
    withIntl(
      <BoutonTelechargement chemin="/api/leases/7/contract/pdf" nomFichier="bail-7.pdf">
        Contrat
      </BoutonTelechargement>,
    ),
  );
}

describe('BoutonTelechargement', () => {
  it('appelle l’origine de l’API — pas celle de Next — avec le Bearer', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 }));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /Contrat/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const attendu = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');
    expect(url).toBe(`${attendu}/api/leases/7/contract/pdf`);
    expect(url).toMatch(/^https?:\/\//);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-593');
  });

  it('montre l’état en cours pendant la requête', async () => {
    let repondre: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => { repondre = r; }));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /Contrat/ }));

    expect(await screen.findByRole('button', { name: fr.documents.download.inProgress })).toBeDisabled();
    repondre(new Response(new Blob(['%PDF']), { status: 200 }));
    expect(await screen.findByRole('button', { name: /Contrat/ })).toBeEnabled();
  });

  it.each([
    [403, fr.documents.download.errors.interdit],
    [422, fr.documents.download.errors.indisponible],
    [500, fr.documents.download.errors.echec],
  ])('un %i se lit dans la langue de l’utilisateur, pas dans la prose du serveur', async (status, message) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'This action is unauthorized.' }), { status }),
    );
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /Contrat/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('This action is unauthorized.')).toBeNull();
  });
});
