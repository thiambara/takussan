import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserLocationProvider, useUserLocation } from '../UserLocationProvider';

/**
 * TCK-1225 (P103.05) — ipapi.co n'est joint qu'au premier lecteur de la ville devinée.
 *
 * Monté par la mise en page racine, le fournisseur appelait ipapi.co dès son montage, sur toute
 * page, alors que quatre écrans seulement lisent `useUserLocation()` : l'IP du visiteur partait
 * chez ce tiers sans qu'aucun écran ne s'en serve.
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

  it('au premier lecteur, résout une fois et rend la ville', async () => {
    render(
      <UserLocationProvider>
        <Lecteur />
        <Lecteur />
      </UserLocationProvider>,
    );

    expect((await screen.findAllByText('ville : Thiès')).length).toBe(2);
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
    expect(appelsIpapi()).toBe(0);
  });
});
