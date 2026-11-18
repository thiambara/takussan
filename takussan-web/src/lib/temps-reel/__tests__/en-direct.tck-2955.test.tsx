/**
 * TCK-2955 (ADR-0129 § 2) — les écrans branchés sur le temps réel, sur le faux Echo (`faux-echo.ts`) :
 * les VRAIS hooks de requête du fil, de la liste, du compteur de non-lus et de la cloche, sous le vrai
 * `TempsReelProvider`. Le compte des appels du faux client API dit ce qui a été relu ; l'intervalle de
 * relecture se lit sur l'observateur de la requête (`refetchInterval`), c'est-à-dire ce que React Query
 * exécutera — pas sur une valeur intermédiaire.
 */
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';
import { instances, reinitialiser, type FauxEcho } from './faux-echo';

vi.mock('laravel-echo', async () => ({ default: (await import('./faux-echo')).FauxEcho }));
vi.mock('pusher-js', () => ({ default: class FauxPusher {} }));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const getNotificationsAction = vi.fn();
vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: (...args: unknown[]) => getNotificationsAction(...args),
  markAllNotificationsReadAction: vi.fn(),
  markNotificationReadAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
}));

const { AuthProvider } = await import('@/context/AuthContext');
const { TempsReelProvider } = await import('../TempsReelProvider');
const { RELECTURE_DE_SECURITE_MS } = await import('../hooks');
const { useConversationsInfinite, useNewMessagesPolling } = await import('@/lib/queries/conversations');
const { useFilEnDirect } = await import('@/components/messages/useFilEnDirect');
const { NonLusQueryKeys, useNonLusTotal } = await import('@/lib/queries/conversations-list');
const { CLES_NOTIFICATIONS, useNotificationsDeLaCloche } = await import('@/components/notifications/useNotifications');

const MOI = { id: 7, roles: [] } as unknown as User;
const CONFIG = { apiUrl: 'http://api.test', mediaUrl: '', tempsReelUrl: 'ws://127.0.0.1:8081', tempsReelCle: 'cle-dev' };
const CLE_DU_FIL: QueryKey = ['conversations', 42, 'messages', 'live', 500];
const CLE_DE_LA_LISTE: QueryKey = ['conversations', 'list', 'infinite'];

/** Ce que `ChatView` monte pour le fil 42 : la relecture `after_id` et son abonnement (`useFilEnDirect`). */
function FilOuvert() {
  useNewMessagesPolling(42, 500);
  useFilEnDirect({ conversationId: 42, sansAncre: false, cocheEnAttente: false });
  return null;
}
function Liste() {
  useConversationsInfinite();
  return null;
}
function Compteur() {
  useNonLusTotal({ refetchInterval: 20_000 });
  return null;
}
function Cloche() {
  useNotificationsDeLaCloche(false);
  return null;
}

let client: QueryClient;

function monter(enfants: React.ReactNode, { avecConfig = true, impersonation = false } = {}) {
  window.__TAKUSSAN_CONFIG__ = avecConfig ? CONFIG : { ...CONFIG, tempsReelUrl: '', tempsReelCle: '' };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AuthProvider initialUser={MOI} initialToken="jeton">
          <TempsReelProvider impersonation={impersonation}>{enfants}</TempsReelProvider>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

/** L'intervalle que React Query exécutera pour la première requête qui commence par `cle`. */
function intervalleDe(cle: QueryKey): unknown {
  const requete = client.getQueryCache().find({ queryKey: cle, exact: false });
  return requete?.observers[0]?.options.refetchInterval;
}

function lecturesDe(chemin: RegExp): number {
  return apiRequest.mock.calls.filter(([c]) => typeof c === 'string' && chemin.test(c)).length;
}

async function connexionTenue(canal: string): Promise<FauxEcho> {
  await waitFor(() => expect(instances).toHaveLength(1));
  const echo = instances[0]!;
  act(() => echo.statut('connected'));
  await waitFor(() => expect(echo.canaux.get(canal)?.autorise).toBe(true));
  return echo;
}

function signal(subject: string, event: string, cursor = '2026-11-18T00:00:01.000001Z') {
  return { subject, event, cursor };
}

beforeEach(() => {
  reinitialiser();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (chemin: string, options: { body?: { channel_name?: string } }) => {
    if (chemin === '/api/broadcasting/auth') return { auth: `cle-dev:signature-${options.body?.channel_name}` };
    return { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 30 } };
  });
  getNotificationsAction.mockReset();
  getNotificationsAction.mockResolvedValue({ ok: true, data: { data: [], meta: { unread: 0 } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
});

afterEach(() => {
  delete window.__TAKUSSAN_CONFIG__;
  document.cookie = 'impersonation_active=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.unstubAllGlobals();
});

describe('AC5 — le fil ouvert (sa relecture sur signal : `ChatView.en-direct.tck-2955`)', () => {
  it('connexion tenue et canal du fil accepté : la relecture `after_id` passe de 3 s à 60 s', async () => {
    monter(<FilOuvert />);
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\/42\/messages/)).toBe(1));
    expect(intervalleDe(CLE_DU_FIL)).toBe(3_000);
    await connexionTenue('private-sujet.conversation.42');
    await waitFor(() => expect(intervalleDe(CLE_DU_FIL)).toBe(RELECTURE_DE_SECURITE_MS));
  });

  it('connexion tenue : aucune relecture du fil sur une fenêtre de 10 s ; sans clé, la même fenêtre en compte au moins trois', async () => {
    const lectures = () => lecturesDe(/^\/api\/conversations\/42\/messages/);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { unmount } = monter(<FilOuvert />);
      await connexionTenue('private-sujet.conversation.42');
      await waitFor(() => expect(intervalleDe(CLE_DU_FIL)).toBe(RELECTURE_DE_SECURITE_MS));
      const avant = lectures();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(lectures()).toBe(avant);
      unmount();

      // Le témoin : la même fenêtre, sans temps réel, relit toutes les 3 s.
      reinitialiser();
      monter(<FilOuvert />, { avecConfig: false });
      await waitFor(() => expect(lectures()).toBeGreaterThan(avant));
      const depart = lectures();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      // Au moins trois : sous `shouldAdvanceTime`, le temps réel écoulé avance aussi l'horloge (charge de la CI).
      expect(lectures() - depart).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('message.created sur son sujet relit les messages neufs — et pas un autre fil', async () => {
    monter(<FilOuvert />);
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\/42\/messages/)).toBe(1));
    const echo = await connexionTenue('private-sujet.conversation.42');

    act(() => echo.canaux.get('private-sujet.conversation.42')!.emettre('.signal', signal('conversation:42', 'message.created')));
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\/42\/messages/)).toBe(2));

    // conversation.read sans coche en attente : rien à relire.
    act(() =>
      echo.canaux
        .get('private-sujet.conversation.42')!
        .emettre('.signal', signal('conversation:42', 'conversation.read', '2026-11-18T00:00:02.000001Z')),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(lecturesDe(/^\/api\/conversations\/42\/messages/)).toBe(2);
  });

  it('AC6 — sans clé de temps réel, le fil garde ses 3 s', async () => {
    monter(<FilOuvert />, { avecConfig: false });
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\/42\/messages/)).toBe(1));
    expect(intervalleDe(CLE_DU_FIL)).toBe(3_000);
    expect(instances).toHaveLength(0);
  });

  it('AC6 — connexion perdue : le fil revient à ses 3 s', async () => {
    monter(<FilOuvert />);
    const echo = await connexionTenue('private-sujet.conversation.42');
    await waitFor(() => expect(intervalleDe(CLE_DU_FIL)).toBe(RELECTURE_DE_SECURITE_MS));
    act(() => echo.statut('connecting'));
    await waitFor(() => expect(intervalleDe(CLE_DU_FIL)).toBe(3_000));
  });
});

describe('la liste des conversations et le compteur de non-lus', () => {
  it('boite.updated sur le canal personnel relit la liste ; tenue, 60 s', async () => {
    monter(<Liste />);
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\?/)).toBe(1));
    const echo = await connexionTenue('private-utilisateur.7');
    await waitFor(() => expect(intervalleDe(CLE_DE_LA_LISTE)).toBe(RELECTURE_DE_SECURITE_MS));

    act(() => echo.canaux.get('private-utilisateur.7')!.emettre('.signal', signal('conversation:42', 'boite.updated')));
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\?/)).toBe(2));

    // Un autre code sur le même canal ne relit pas la liste.
    act(() =>
      echo.canaux
        .get('private-utilisateur.7')!
        .emettre('.signal', signal('utilisateur:7', 'notifications.updated', '2026-11-18T00:00:02.000001Z')),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(lecturesDe(/^\/api\/conversations\?/)).toBe(2);
  });

  it('AC6 — connexion perdue : la liste revient à ses 10 s', async () => {
    monter(<Liste />);
    const echo = await connexionTenue('private-utilisateur.7');
    await waitFor(() => expect(intervalleDe(CLE_DE_LA_LISTE)).toBe(RELECTURE_DE_SECURITE_MS));
    act(() => echo.statut('failed'));
    await waitFor(() => expect(intervalleDe(CLE_DE_LA_LISTE)).toBe(10_000));
  });

  it('le compteur de non-lus suit boite.updated, et garde sa cadence hors connexion', async () => {
    monter(<Compteur />);
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\?per_page=1/)).toBe(1));
    expect(intervalleDe(NonLusQueryKeys.total)).toBe(20_000);
    const echo = await connexionTenue('private-utilisateur.7');
    await waitFor(() => expect(intervalleDe(NonLusQueryKeys.total)).toBe(RELECTURE_DE_SECURITE_MS));

    act(() => echo.canaux.get('private-utilisateur.7')!.emettre('.signal', signal('conversation:42', 'boite.updated')));
    await waitFor(() => expect(lecturesDe(/^\/api\/conversations\?per_page=1/)).toBe(2));
  });
});

describe('la cloche des notifications', () => {
  it('notifications.updated relit la cloche ; tenue, 60 s', async () => {
    monter(<Cloche />);
    await waitFor(() => expect(getNotificationsAction).toHaveBeenCalledTimes(1));
    const echo = await connexionTenue('private-utilisateur.7');
    await waitFor(() => expect(intervalleDe(CLES_NOTIFICATIONS.cloche(false))).toBe(RELECTURE_DE_SECURITE_MS));

    act(() =>
      echo.canaux.get('private-utilisateur.7')!.emettre('.signal', signal('utilisateur:7', 'notifications.updated')),
    );
    await waitFor(() => expect(getNotificationsAction).toHaveBeenCalledTimes(2));
  });

  it('AC6 — sans connexion, la cloche garde ses 30 s', async () => {
    monter(<Cloche />, { avecConfig: false });
    await waitFor(() => expect(getNotificationsAction).toHaveBeenCalledTimes(1));
    expect(intervalleDe(CLES_NOTIFICATIONS.cloche(false))).toBe(30_000);
  });
});
