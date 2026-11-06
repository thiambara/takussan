import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { IMPERSONATION_MARKER_COOKIE } from '@/lib/impersonation';
import { prefsDe } from '@/lib/navigation/preferences';
import fr from '@/messages/fr.json';
import { DELAI_D_ENVOI_MS, PreferencesDuMenuProvider, usePreferencesDuMenu } from '../PreferencesDuMenu';

/**
 * TCK-2480 — l'écriture des préférences du menu : optimiste, envoyée après un court délai, rétablie
 * et dite (toast) sur un échec.
 */
const fetchMock = vi.fn<typeof fetch>();

function Sonde() {
  const p = usePreferencesDuMenu();
  const epingles = prefsDe(p.navigation, 'agent').epingles ?? [];
  return (
    <>
      <output data-testid="epingles">{epingles.join(',')}</output>
      <output data-testid="bailleur">{(prefsDe(p.navigation, 'bailleur').replies ?? []).join(',')}</output>
      <button type="button" onClick={() => p.basculerEpingle('agent', 'commissions', epingles)}>commissions</button>
      <button type="button" onClick={() => p.basculerEpingle('agent', 'baux', epingles)}>baux</button>
      <button type="button" onClick={() => p.reinitialiser('agent')}>réinitialiser</button>
      <button type="button" onClick={() => p.choisirModeIcones('icones')}>icônes</button>
      <output data-testid="mode">{p.modeIcones}</output>
      <output data-testid="actif">{String(p.actif)}</output>
    </>
  );
}

function rendre(navigationInitiale?: unknown) {
  return render(
    withIntl(
      <ToastProvider>
        <PreferencesDuMenuProvider navigationInitiale={navigationInitiale} persona="agent" modeIconesInitial="auto">
          <Sonde />
        </PreferencesDuMenuProvider>
        <Toaster />
      </ToastProvider>,
    ),
  );
}

const corps = (appel: number) => JSON.parse(String(fetchMock.mock.calls[appel][1]?.body)) as unknown;
const attendreLEnvoi = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(DELAI_D_ENVOI_MS);
  });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = `${IMPERSONATION_MARKER_COOKIE}=; max-age=0`;
  document.cookie = 'menu_icones=; path=/app; max-age=0';
});

describe('PreferencesDuMenuProvider — TCK-2480', () => {
  it('sans fournisseur, le repli est inerte (A12)', () => {
    render(withIntl(<Sonde />));
    expect(screen.getByTestId('actif')).toHaveTextContent('false');
    expect(screen.getByTestId('mode')).toHaveTextContent('complet');
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
  });

  it('optimiste : le geste se voit tout de suite, et part après le délai, en PATCH /api/me', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions');
    expect(fetchMock).not.toHaveBeenCalled();
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions'] } } } });
  });

  it('deux gestes rapprochés partent en UNE écriture, qui porte l’état final', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    fireEvent.click(screen.getByRole('button', { name: 'baux' }));
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions', 'baux'] } } } });
  });

  it('le délai court depuis le DERNIER geste : un geste pendant l’attente la relance', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_D_ENVOI_MS - 100);
    });
    fireEvent.click(screen.getByRole('button', { name: 'baux' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_D_ENVOI_MS - 100);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un échec rétablit l’état et le dit (toast)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
    expect(screen.getByText(fr.nav.sidebar.preferences.echec)).toBeInTheDocument();
  });

  it('une panne réseau aussi', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
  });

  it('l’état rétabli est le dernier ACCEPTÉ par l’API, pas l’état initial', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    fetchMock.mockResolvedValue(new Response('{}', { status: 422 }));
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    expect(screen.getByTestId('epingles')).toHaveTextContent('');
    await attendreLEnvoi();
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions');
  });

  it('un geste plus récent en attente suspend le rétablissement : il porte l’état entier (A4)', async () => {
    let repondre: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (repondre = r)));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Un second geste pendant que la première écriture est en vol…
    fireEvent.click(screen.getByRole('button', { name: 'baux' }));
    // … puis la première échoue : l'état du second geste reste affiché, sans toast.
    await act(async () => repondre(new Response('{}', { status: 500 })));
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions,baux');
    expect(screen.queryByText(fr.nav.sidebar.preferences.echec)).toBeNull();
    await attendreLEnvoi();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(corps(1)).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions', 'baux'] } } } });
  });

  it('AC2 — un geste chez l’agent réécrit le bailleur tel quel', async () => {
    rendre({ v: 1, personas: { bailleur: { replies: ['activite'] } } });
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(corps(0)).toEqual({
      navigation: { v: 1, personas: { bailleur: { replies: ['activite'] }, agent: { epingles: ['commissions'] } } },
    });
    expect(screen.getByTestId('bailleur')).toHaveTextContent('activite');
  });

  it('réinitialiser le dernier persona personnalisé envoie `null`', async () => {
    rendre({ v: 1, personas: { agent: { epingles: ['baux'] } } });
    fireEvent.click(screen.getByRole('button', { name: 'réinitialiser' }));
    await attendreLEnvoi();
    expect(corps(0)).toEqual({ navigation: null });
  });

  it('A5 — sous impersonation, le geste reste dans l’onglet : aucune écriture, aucun toast', async () => {
    document.cookie = `${IMPERSONATION_MARKER_COOKIE}=1`;
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    await attendreLEnvoi();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('epingles')).toHaveTextContent('commissions');
    expect(screen.queryByText(fr.nav.sidebar.preferences.echec)).toBeNull();
  });

  it('A4 — ce qui attend part au démontage, en `keepalive`, sans attendre le délai', () => {
    const { unmount } = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', keepalive: true });
    expect(corps(0)).toEqual({ navigation: { v: 1, personas: { agent: { epingles: ['commissions'] } } } });
  });

  it('A4 — et au `pagehide`', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'commissions' }));
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ keepalive: true });
  });

  it('le mode icônes : l’état ET le cookie de l’appareil', () => {
    window.history.replaceState(null, '', '/app');
    rendre();
    expect(screen.getByTestId('mode')).toHaveTextContent('auto');
    fireEvent.click(screen.getByRole('button', { name: 'icônes' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('icones');
    expect(document.cookie).toContain('menu_icones=1');
  });
});
