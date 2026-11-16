import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserLocationProvider, useUserLocation } from '../UserLocationProvider';

/**
 * TCK-1225 (P103.05) — ipapi.co n'est joint qu'au premier lecteur de la ville devinée.
 *
 * Monté par la mise en page racine, le fournisseur appelait ipapi.co dès son montage, sur toute
 * page, alors que quatre écrans seulement lisent `useUserLocation()` : l'IP du visiteur partait
 * chez ce tiers sans qu'aucun écran ne s'en serve.
 *
 * TCK-537 (décision du porteur du 2026-11-16) — et seulement au PREMIER GESTE du visiteur : un
 * lecteur monté (l'accueil en est un) ne lit que le cache ; le réseau attend un appui ou une touche.
 */

const fetchMock = vi.fn();

function appelsIpapi(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('ipapi.co')).length;
}

function Lecteur() {
  const { city } = useUserLocation();
  return <p>ville : {city}</p>;
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ city: 'Thiès' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserLocationProvider', () => {
  it('monté sans lecteur, ne joint pas ipapi.co', async () => {
    render(
      <UserLocationProvider>
        <p>une fiche</p>
      </UserLocationProvider>,
    );

    await new Promise((r) => setTimeout(r, 30));
    expect(appelsIpapi()).toBe(0);
  });

  it('un lecteur monté sans geste ne joint pas ipapi.co et rend le repli', async () => {
    render(
      <UserLocationProvider>
        <Lecteur />
      </UserLocationProvider>,
    );

    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText('ville : Dakar')).toBeInTheDocument();
    expect(appelsIpapi()).toBe(0);
  });

  it('sans geste, `loading` retombe : aucun écran ne reste en squelette', async () => {
    function Etat() {
      const { loading } = useUserLocation();
      return <p>{loading ? 'attente' : 'prêt'}</p>;
    }
    render(
      <UserLocationProvider>
        <Etat />
      </UserLocationProvider>,
    );

    expect(await screen.findByText('prêt')).toBeInTheDocument();
    expect(appelsIpapi()).toBe(0);
  });

  it.each(['pointerDown', 'touchStart', 'keyDown'] as const)(
    'au premier geste (%s), résout une fois et rend la ville',
    async (geste) => {
      render(
        <UserLocationProvider>
          <Lecteur />
          <Lecteur />
        </UserLocationProvider>,
      );
      await new Promise((r) => setTimeout(r, 30));
      expect(appelsIpapi()).toBe(0);

      fireEvent[geste](document.body);
      fireEvent[geste](document.body);

      expect((await screen.findAllByText('ville : Thiès')).length).toBe(2);
      expect(appelsIpapi()).toBe(1);
    },
  );

  it('un geste sans lecteur ne joint pas ipapi.co', async () => {
    render(
      <UserLocationProvider>
        <p>une fiche</p>
      </UserLocationProvider>,
    );

    fireEvent.pointerDown(document.body);
    await new Promise((r) => setTimeout(r, 30));
    expect(appelsIpapi()).toBe(0);
  });

  it('geste déjà fait, sans cache : `loading` attend la réponse (défauts de l’assistant non figés à vide)', async () => {
    let repondre: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (repondre = r)));
    function Etat() {
      const { loading, location } = useUserLocation();
      return <p>{loading ? 'attente' : `prêt ${location?.city ?? '—'}`}</p>;
    }
    const { rerender } = render(
      <UserLocationProvider>
        <p>une fiche</p>
      </UserLocationProvider>,
    );
    fireEvent.pointerDown(document.body);
    rerender(
      <UserLocationProvider>
        <Etat />
      </UserLocationProvider>,
    );

    await waitFor(() => expect(appelsIpapi()).toBe(1));
    expect(screen.getByText('attente')).toBeInTheDocument();
    repondre(new Response(JSON.stringify({ city: 'Thiès' }), { status: 200 }));
    expect(await screen.findByText('prêt Thiès')).toBeInTheDocument();
  });

  it('un geste fait AVANT le montage du lecteur compte (navigation côté client)', async () => {
    const { rerender } = render(
      <UserLocationProvider>
        <p>une fiche</p>
      </UserLocationProvider>,
    );
    fireEvent.pointerDown(document.body);
    rerender(
      <UserLocationProvider>
        <Lecteur />
      </UserLocationProvider>,
    );

    expect(await screen.findByText('ville : Thiès')).toBeInTheDocument();
    expect(appelsIpapi()).toBe(1);
  });

  it('garde le cache de 24 h', async () => {
    window.localStorage.setItem(
      'takussan:user-location',
      JSON.stringify({ data: { city: 'Ziguinchor' }, at: Date.now() }),
    );
    render(
      <UserLocationProvider>
        <Lecteur />
      </UserLocationProvider>,
    );

    await waitFor(() => expect(screen.getByText('ville : Ziguinchor')).toBeInTheDocument());
    fireEvent.pointerDown(document.body);
    await new Promise((r) => setTimeout(r, 30));
    expect(appelsIpapi()).toBe(0);
  });
});
