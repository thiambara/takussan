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
      <button type="button" onClick={() => p.basculerEpingle('agent', 'visites', epingles)}>visites</button>
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

/**
 * Revue adverse de TCK-2480 (I1) — deux écritures ne se chevauchent jamais. Les réponses sont
 * pilotées à la main (`enVol`) : c'est sur un réseau lent (PATCH au-delà de 800 ms) que l'écran et le
 * compte divergeaient, et aucun cas à réponse immédiate ne pouvait le voir.
 */
describe('PreferencesDuMenuProvider — une écriture en vol à la fois (revue, I1)', () => {
  type Pilote = { readonly resoudre: (r: Response) => void; readonly rejeter: (e: unknown) => void };
  const enVol: Pilote[] = [];
  const ok = () => new Response('{}', { status: 200 });
  const echec = () => new Response('{}', { status: 500 });
  const clic = (nom: string) => fireEvent.click(screen.getByRole('button', { name: nom }));
  const passer = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const epinglesDuCorps = (appel: number) =>
    (corps(appel) as { navigation: { personas: { agent: { epingles: string[] } } } }).navigation.personas.agent.epingles;

  beforeEach(() => {
    enVol.length = 0;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resoudre, rejeter) => enVol.push({ resoudre, rejeter })),
    );
  });

  it('R1 — un geste fait pendant le vol attend sa réponse ; G1 échoue, G2 part alors et est accepté : l’écran garde G2, sans toast', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clic('baux');
    await passer(DELAI_D_ENVOI_MS);
    // Le délai de G2 est écoulé, mais G1 est encore en vol : rien ne part en parallèle.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => enVol[0]!.rejeter(new TypeError('Failed to fetch')));
    // À la réponse de G1, G2 part tout de suite (son délai est déjà écoulé), avec l'état le plus récent.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(epinglesDuCorps(1)).toEqual(['commissions', 'baux']);
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions,baux$/);
    await act(async () => enVol[1]!.resoudre(ok()));
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions,baux$/);
    expect(screen.queryByText(fr.nav.sidebar.preferences.echec)).toBeNull();
  });

  it('R2 — G1 accepté, puis G2 (parti après lui) refusé : l’écran revient à G1 — ce que le compte porte — et le dit', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    clic('baux');
    await passer(DELAI_D_ENVOI_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => enVol[0]!.resoudre(ok()));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => enVol[1]!.resoudre(echec()));
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions$/);
    expect(screen.getByText(fr.nav.sidebar.preferences.echec)).toBeInTheDocument();
  });

  it('R3 — l’ordre des réponses suit l’ordre d’émission : G2 ne part qu’après G1, et un échec de G3 rétablit G2', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    clic('baux');
    await passer(DELAI_D_ENVOI_MS);
    // G2 ne peut pas répondre avant G1 : il n'est pas parti.
    expect(enVol).toHaveLength(1);
    await act(async () => enVol[0]!.resoudre(ok()));
    await act(async () => enVol[1]!.resoudre(ok()));
    clic('visites');
    await passer(DELAI_D_ENVOI_MS);
    await act(async () => enVol[2]!.resoudre(echec()));
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions,baux$/);
    expect(screen.getByText(fr.nav.sidebar.preferences.echec)).toBeInTheDocument();
  });

  it('un geste dont le délai n’est PAS écoulé à la réponse du vol attend la fin de son délai', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    clic('baux');
    await passer(300);
    await act(async () => enVol[0]!.resoudre(ok()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await passer(DELAI_D_ENVOI_MS - 300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(epinglesDuCorps(1)).toEqual(['commissions', 'baux']);
  });

  it('`pagehide` pendant un vol : l’état le plus récent part en `keepalive` sans attendre ; réponses inversées, la plus récente émise fait foi', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    clic('baux');
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ keepalive: true });
    expect(epinglesDuCorps(1)).toEqual(['commissions', 'baux']);
    // La page revient (bfcache) : G2 répond AVANT G1.
    await act(async () => enVol[1]!.resoudre(ok()));
    await act(async () => enVol[0]!.resoudre(ok()));
    // Le dernier état accepté est celui de G2, émis en dernier : un échec suivant y revient.
    clic('visites');
    await passer(DELAI_D_ENVOI_MS);
    await act(async () => enVol[2]!.resoudre(echec()));
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions,baux$/);
  });

  it('`pagehide` pendant un vol, rien en attente : l’état en vol repart en `keepalive` (la requête ordinaire meurt avec la page)', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ keepalive: true });
    expect(epinglesDuCorps(1)).toEqual(['commissions']);
    // Un second `pagehide` ne renvoie rien : ce qui est en vol est déjà en `keepalive`.
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un échec en vol pendant qu’une requête plus récente vole encore n’est pas jugé seul', async () => {
    rendre();
    clic('commissions');
    await passer(DELAI_D_ENVOI_MS);
    clic('baux');
    window.dispatchEvent(new Event('pagehide'));
    await act(async () => enVol[0]!.resoudre(echec()));
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions,baux$/);
    expect(screen.queryByText(fr.nav.sidebar.preferences.echec)).toBeNull();
    await act(async () => enVol[1]!.resoudre(ok()));
    expect(screen.getByTestId('epingles')).toHaveTextContent(/^commissions,baux$/);
    expect(screen.queryByText(fr.nav.sidebar.preferences.echec)).toBeNull();
  });
});
