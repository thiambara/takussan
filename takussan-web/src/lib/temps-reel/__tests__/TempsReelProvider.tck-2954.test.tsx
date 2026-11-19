/**
 * TCK-2954 (ADR-0129 § 4) — le client temps réel, sur un faux Echo de la forme d'Echo
 * (`faux-echo.ts`) : aucune socket, aucun serveur. Le vrai `connexion.ts` est exercé — c'est lui
 * qui autorise les canaux par `apiRequest` et nomme l'événement `.signal`.
 *
 * Le témoin est un « fil » : une requête React Query relue toutes les 3 s aujourd'hui
 * (`lib/queries/conversations.ts`), abonnée à son sujet par `useSujetEnDirect`, et dont l'intervalle
 * passe par `useIntervalleDeRelecture`. Le compte des appels du faux client API dit ce qui a été relu.
 */
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/auth';
import { FauxEcho, constructions, instances, reinitialiser } from './faux-echo';

vi.mock('laravel-echo', async () => ({ default: (await import('./faux-echo')).FauxEcho }));
vi.mock('pusher-js', () => ({ default: class FauxPusher {} }));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { TempsReelProvider } = await import('../TempsReelProvider');
const { useIntervalleDeRelecture, usePresenceDuSujet, useSignal, useSujetEnDirect, RELECTURE_DE_SECURITE_MS } =
  await import('../hooks');

const lectures = { 42: vi.fn(), 43: vi.fn() };

function Fil({ id }: { readonly id: 42 | 43 }) {
  const sujet = `conversation:${id}`;
  useSujetEnDirect(sujet, [['fil', id]]);
  const intervalle = useIntervalleDeRelecture(3_000, sujet);
  useQuery({
    queryKey: ['fil', id],
    queryFn: async () => {
      lectures[id]();
      return id;
    },
    refetchInterval: intervalle,
  });
  return <span data-testid={`intervalle-${id}`}>{String(intervalle)}</span>;
}

const signauxPersonnels = vi.fn();
function Cloche() {
  useSignal({ personnel: ['notifications.updated'] }, (signal) => signauxPersonnels(signal));
  return null;
}

function Presence() {
  const ids = usePresenceDuSujet('conversation:42');
  return <span data-testid="presents">{ids.join(',')}</span>;
}

const sonde: { auth: ReturnType<typeof useAuth> | null } = { auth: null };
function Sonde() {
  const contexte = useAuth();
  useEffect(() => {
    sonde.auth = contexte;
  });
  return null;
}

const A = { id: 7, roles: [] } as unknown as User;
const B = { id: 8, roles: [] } as unknown as User;

const CONFIG = { apiUrl: 'http://api.test', mediaUrl: '', tempsReelUrl: 'ws://127.0.0.1:8081', tempsReelCle: 'cle-dev' };

function monter({
  avecConfig = true,
  impersonation = false,
  chargerConnexion,
  enfants,
}: {
  avecConfig?: boolean;
  impersonation?: boolean;
  chargerConnexion?: () => Promise<typeof import('../connexion')>;
  enfants?: React.ReactNode;
} = {}) {
  window.__TAKUSSAN_CONFIG__ = avecConfig ? CONFIG : { ...CONFIG, tempsReelUrl: '', tempsReelCle: '' };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider initialUser={A} initialToken="jeton-a">
        <TempsReelProvider impersonation={impersonation} {...(chargerConnexion ? { chargerConnexion } : {})}>
          <Sonde />
          {enfants ?? (
            <>
              <Fil id={42} />
              <Fil id={43} />
            </>
          )}
        </TempsReelProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** La connexion ouverte, tenue, ses canaux autorisés, et la première lecture de chaque fil faite. */
async function connexionTenue(): Promise<FauxEcho> {
  await waitFor(() => expect(instances).toHaveLength(1));
  const echo = instances[0]!;
  await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(lectures[43]).toHaveBeenCalledTimes(1));
  act(() => echo.statut('connected'));
  await waitFor(() => expect(echo.canaux.get('private-sujet.conversation.42')?.autorise).toBe(true));
  return echo;
}

function signal(subject: string, cursor: string, event = 'message.created') {
  return { subject, event, cursor };
}

function appelsDAutorisation() {
  return apiRequest.mock.calls.filter(([chemin]) => chemin === '/api/broadcasting/auth');
}

beforeEach(() => {
  reinitialiser();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_chemin: string, options: { body: { channel_name: string } }) => ({
    auth: `cle-dev:signature-${options.body.channel_name}`,
  }));
  lectures[42].mockReset();
  lectures[43].mockReset();
  signauxPersonnels.mockReset();
  sonde.auth = null;
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

describe('la connexion', () => {
  it('ouvre UNE connexion Reverb vers l’origine posée, et autorise chaque canal par apiRequest avec le jeton de la session', async () => {
    monter();
    const echo = await connexionTenue();

    expect(constructions).toHaveLength(1);
    expect(echo.options).toMatchObject({
      broadcaster: 'reverb',
      key: 'cle-dev',
      wsHost: '127.0.0.1',
      wsPort: 8081,
      forceTLS: false,
    });
    expect([...echo.canaux.keys()].sort()).toEqual(['private-sujet.conversation.42', 'private-sujet.conversation.43']);
    // Le préfixe `/api` : Laravel, pas le BFF. Le jeton de la session, explicite.
    expect(appelsDAutorisation()).toContainEqual([
      '/api/broadcasting/auth',
      { method: 'POST', token: 'jeton-a', body: { socket_id: '123.456', channel_name: 'private-sujet.conversation.42' } },
    ]);
  });
});

describe('AC1 — un signal invalide exactement les requêtes de son sujet', () => {
  it('un signal sur conversation:42 relit le fil 42 et pas le fil 43', async () => {
    monter();
    const echo = await connexionTenue();

    act(() =>
      echo.canaux.get('private-sujet.conversation.42')!.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:01.000001Z')),
    );

    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(2));
    expect(lectures[43]).toHaveBeenCalledTimes(1);
  });

  it('un signal d’un autre sujet, ou mal formé, n’invalide rien — sans erreur', async () => {
    monter();
    const echo = await connexionTenue();
    const canal = echo.canaux.get('private-sujet.conversation.42')!;

    act(() => {
      canal.emettre('.signal', signal('conversation:43', '2026-11-18T00:00:01.000001Z'));
      canal.emettre('.signal', signal('conversation42', '2026-11-18T00:00:02.000001Z'));
      canal.emettre('.signal', signal('Conversation:42', '2026-11-18T00:00:03.000001Z'));
      canal.emettre('.signal', { subject: 'conversation:42', event: 'message.created' });
      canal.emettre('.signal', 'pas un objet');
      // Un autre nom d'événement que `signal` n'est pas écouté.
      canal.emettre('signal', signal('conversation:42', '2026-11-18T00:00:04.000001Z'));
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(lectures[42]).toHaveBeenCalledTimes(1);
    expect(lectures[43]).toHaveBeenCalledTimes(1);
  });

  it('sur le canal personnel, seuls les codes demandés atteignent l’écran', async () => {
    monter({ enfants: <Cloche /> });
    await waitFor(() => expect(instances).toHaveLength(1));
    const echo = instances[0]!;
    await waitFor(() => expect(echo.canaux.has('private-utilisateur.7')).toBe(true));
    const canal = echo.canaux.get('private-utilisateur.7')!;

    act(() => {
      canal.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:01.000001Z', 'boite.updated'));
      canal.emettre('.signal', signal('utilisateur:7', '2026-11-18T00:00:02.000001Z', 'notifications.updated'));
    });

    expect(signauxPersonnels).toHaveBeenCalledTimes(1);
    expect(signauxPersonnels).toHaveBeenCalledWith({
      subject: 'utilisateur:7',
      event: 'notifications.updated',
      cursor: '2026-11-18T00:00:02.000001Z',
    });
  });
});

describe('AC2 — le curseur', () => {
  it('un signal plus ancien ou égal au dernier vu n’invalide rien', async () => {
    monter();
    const echo = await connexionTenue();
    const canal = echo.canaux.get('private-sujet.conversation.42')!;

    act(() => canal.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:05.000002Z')));
    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(2));

    act(() => {
      canal.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:05.000002Z'));
      canal.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:05.000001Z'));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(lectures[42]).toHaveBeenCalledTimes(2);

    act(() => canal.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:05.000003Z')));
    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(3));
  });
});

describe('AC3 — les trois états du mode dégradé', () => {
  it('connexion tenue et canal accepté : la relecture du fil passe à 60 s', async () => {
    monter();
    await connexionTenue();
    await waitFor(() => expect(screen.getByTestId('intervalle-42').textContent).toBe(String(RELECTURE_DE_SECURITE_MS)));
  });

  it('connexion perdue : le fil revient à ses 3 s d’aujourd’hui', async () => {
    monter();
    const echo = await connexionTenue();
    await waitFor(() => expect(screen.getByTestId('intervalle-42').textContent).toBe('60000'));

    act(() => echo.statut('connecting'));
    expect(screen.getByTestId('intervalle-42').textContent).toBe('3000');
    act(() => echo.statut('failed'));
    expect(screen.getByTestId('intervalle-42').textContent).toBe('3000');
  });

  it('jamais établie : 3 s', async () => {
    monter();
    await waitFor(() => expect(instances).toHaveLength(1));
    expect(screen.getByTestId('intervalle-42').textContent).toBe('3000');
  });

  it('canal REFUSÉ (403 : agence suspendue) sous une connexion tenue : le fil garde ses 3 s', async () => {
    apiRequest.mockImplementation(async (_chemin: string, options: { body: { channel_name: string } }) => {
      if (options.body.channel_name === 'private-sujet.conversation.43') throw new Error('403');
      return { auth: 'cle-dev:signature' };
    });
    monter();
    const echo = await connexionTenue();
    await waitFor(() => expect(echo.canaux.get('private-sujet.conversation.43')?.autorise).toBe(false));

    await waitFor(() => expect(screen.getByTestId('intervalle-42').textContent).toBe('60000'));
    expect(screen.getByTestId('intervalle-43').textContent).toBe('3000');
  });

  it('reconnexion : une relecture immédiate de chaque sujet abonné — et aucune à la première connexion', async () => {
    monter();
    const echo = await connexionTenue();
    await new Promise((r) => setTimeout(r, 20));
    expect(lectures[42]).toHaveBeenCalledTimes(1);
    expect(lectures[43]).toHaveBeenCalledTimes(1);

    act(() => echo.statut('disconnected'));
    act(() => echo.statut('connecting'));
    act(() => echo.statut('connected'));

    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(lectures[43]).toHaveBeenCalledTimes(2));
  });
});

describe('AC4 — sans TEMPS_REEL_URL, rien ne change', () => {
  it('ni module chargé, ni Echo construit, ni autorisation ; les intervalles d’aujourd’hui', async () => {
    const charger = vi.fn(() => import('../connexion'));
    monter({ avecConfig: false, chargerConnexion: charger });

    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(charger).not.toHaveBeenCalled();
    expect(constructions).toHaveLength(0);
    expect(appelsDAutorisation()).toHaveLength(0);
    expect(screen.getByTestId('intervalle-42').textContent).toBe('3000');
    expect(screen.getByTestId('intervalle-43').textContent).toBe('3000');
  });

  it('hors du fournisseur, l’intervalle d’aujourd’hui — et `false` reste `false`', () => {
    function Nu() {
      const a = useIntervalleDeRelecture(10_000, 'conversation:42');
      const b = useIntervalleDeRelecture(false, 'conversation:42');
      return <span data-testid="nu">{`${a}|${b}`}</span>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Nu />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('nu').textContent).toBe('10000|false');
  });
});

describe('AC5 — coupé pendant une impersonation', () => {
  it('témoin du relais posé, MÊME avec un jeton dans le contexte : ni module, ni connexion, ni autorisation', async () => {
    document.cookie = 'impersonation_active=1; path=/';
    const charger = vi.fn(() => import('../connexion'));
    monter({ chargerConnexion: charger });

    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(charger).not.toHaveBeenCalled();
    expect(constructions).toHaveLength(0);
    expect(appelsDAutorisation()).toHaveLength(0);
    expect(screen.getByTestId('intervalle-42').textContent).toBe('3000');
  });

  it('signal du layout (cookie httpOnly lu au serveur) : de même', async () => {
    const charger = vi.fn(() => import('../connexion'));
    monter({ impersonation: true, chargerConnexion: charger });

    await waitFor(() => expect(lectures[42]).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(charger).not.toHaveBeenCalled();
    expect(constructions).toHaveLength(0);
    expect(appelsDAutorisation()).toHaveLength(0);
    expect(screen.getByTestId('intervalle-42').textContent).toBe('3000');
  });
});

describe('AC6 — la session ne fuit pas', () => {
  it('après logout() puis openSession() d’un autre compte : nouvelle connexion, aucun canal du premier, nouveau jeton', async () => {
    const signauxRecus = vi.fn();
    function Ecran() {
      useSignal({ personnel: ['notifications.updated'] }, signauxRecus);
      useSignal('conversation:42', signauxRecus);
      return null;
    }
    monter({ enfants: <Ecran /> });
    await waitFor(() => expect(instances).toHaveLength(1));
    const premiere = instances[0]!;
    await waitFor(() => expect(premiere.canaux.has('private-utilisateur.7')).toBe(true));
    await waitFor(() => expect(premiere.canaux.has('private-sujet.conversation.42')).toBe(true));
    const canalDeA = premiere.canaux.get('private-utilisateur.7')!;
    const sujetDeA = premiere.canaux.get('private-sujet.conversation.42')!;

    await act(async () => {
      await sonde.auth!.logout();
    });
    expect(premiere.deconnecte).toBe(true);
    expect(instances).toHaveLength(1);

    const autorisationsAvant = appelsDAutorisation().length;
    await act(async () => {
      await sonde.auth!.openSession('jeton-b', B);
    });
    await waitFor(() => expect(instances).toHaveLength(2));
    const seconde = instances[1]!;
    await waitFor(() => expect(seconde.canaux.has('private-utilisateur.8')).toBe(true));

    expect([...seconde.canaux.keys()].sort()).toEqual(['private-sujet.conversation.42', 'private-utilisateur.8']);
    // L'ancienne connexion n'a reçu aucun canal de la nouvelle session.
    expect(premiere.canaux.has('private-utilisateur.8')).toBe(false);
    const nouvelles = appelsDAutorisation().slice(autorisationsAvant);
    expect(nouvelles.length).toBeGreaterThan(0);
    for (const [, options] of nouvelles) expect((options as { token: string }).token).toBe('jeton-b');

    // Ce que l'ancienne connexion recevrait encore n'atteint plus aucun écran.
    act(() => {
      canalDeA.emettre('.signal', signal('utilisateur:7', '2026-11-18T00:00:09.000001Z', 'notifications.updated'));
      sujetDeA.emettre('.signal', signal('conversation:42', '2026-11-18T00:00:09.000001Z'));
    });
    expect(signauxRecus).not.toHaveBeenCalled();
  });
});

describe('AC6 — changement de session en un seul rendu', () => {
  it('openSession() d’un autre compte sans logout : l’ancienne connexion ne reçoit aucun canal du nouveau, et rien ne part sous l’ancien jeton', async () => {
    function Ecran() {
      useSignal({ personnel: ['notifications.updated'] }, () => {});
      useSignal('conversation:42', () => {});
      return null;
    }
    monter({ enfants: <Ecran /> });
    await waitFor(() => expect(instances).toHaveLength(1));
    const premiere = instances[0]!;
    await waitFor(() => expect(premiere.canaux.has('private-sujet.conversation.42')).toBe(true));
    const autorisationsAvant = appelsDAutorisation().length;

    await act(async () => {
      await sonde.auth!.openSession('jeton-b', B);
    });
    await waitFor(() => expect(instances).toHaveLength(2));
    const seconde = instances[1]!;
    await waitFor(() => expect(seconde.canaux.get('private-sujet.conversation.42')?.autorise).toBe(true));

    expect(premiere.deconnecte).toBe(true);
    expect(premiere.canaux.has('private-utilisateur.8')).toBe(false);
    expect([...seconde.canaux.keys()].sort()).toEqual(['private-sujet.conversation.42', 'private-utilisateur.8']);
    const nouvelles = appelsDAutorisation().slice(autorisationsAvant);
    expect(nouvelles.map(([, o]) => (o as { body: { channel_name: string } }).body.channel_name).sort()).toEqual([
      'private-sujet.conversation.42',
      'private-utilisateur.8',
    ]);
    for (const [, options] of nouvelles) expect((options as { token: string }).token).toBe('jeton-b');
  });
});

describe('la présence', () => {
  it('rejoint presence-sujet.*, publie les identifiants, et rend [] quand la connexion se ferme', async () => {
    monter({ enfants: <Presence /> });
    await waitFor(() => expect(instances).toHaveLength(1));
    const echo = instances[0]!;
    await waitFor(() => expect(echo.canaux.has('presence-sujet.conversation.42')).toBe(true));
    const canal = echo.canaux.get('presence-sujet.conversation.42')!;

    act(() => canal.membres([7, 9]));
    expect(screen.getByTestId('presents').textContent).toBe('7,9');
    act(() => canal.depart(9));
    act(() => canal.arrivee(12));
    expect(screen.getByTestId('presents').textContent).toBe('7,12');

    await act(async () => {
      await sonde.auth!.logout();
    });
    expect(screen.getByTestId('presents').textContent).toBe('');
  });
});
