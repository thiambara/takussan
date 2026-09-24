import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { ConversationInfoSheet } from '../ConversationInfoSheet';

/**
 * TCK-565 — l'invitation d'un participant dans un groupe existant se fait PAR LE NOM, comme à la
 * création (M12 du retour testeur du 2026-09-23). Le champ était un second `<input
 * type="number">` « ID utilisateur ».
 */

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

const CONTACTS = [
  { id: 5, name: 'Awa Sarr', avatar_url: null },
  { id: 6, name: 'Moussa Ndiaye', avatar_url: null },
];

type Appel = { url: URL; method: string; body: unknown };
let appels: Appel[] = [];
/** Réponse de `POST …/participants` : 201 par défaut, ou la 422 qu'un test impose. */
let reponseAjout: { status: number; corps: unknown } = { status: 201, corps: { data: { added_user_ids: [6] } } };

function mockApi() {
  reponseAjout = { status: 201, corps: { data: { added_user_ids: [6] } } };
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      appels.push({ url, method: init?.method ?? 'GET', body });
      // La liste du GROUPE (règle d'ajout à ce groupe), jamais celle d'un nouveau groupe.
      if (url.pathname === '/api/conversations/12/contacts') {
        const terme = (url.searchParams.get('filter[search]') ?? '').toLowerCase();
        const data = CONTACTS.filter((c) => c.name.toLowerCase().includes(terme));
        return {
          ok: true,
          status: 200,
          json: async () => ({ data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } }),
        };
      }
      if (url.pathname === '/api/conversations/12/participants') {
        const { status, corps } = reponseAjout;
        return { ok: status < 400, status, json: async () => corps };
      }
      return { ok: false, status: 404, json: async () => ({ message: 'introuvable' }) };
    }),
  );
}

const PARTICIPANT = { is_muted: false, last_read_at: null, joined_at: '2026-09-01T00:00:00+00:00', left_at: null };

const GROUPE = {
  id: 12,
  subject: 'Travaux',
  type: 'group',
  participants: [
    { ...PARTICIPANT, id: 1, user_id: 1, role: 'admin', user: { id: 1, full_name: 'Fatou Diop', avatar_url: null } },
    { ...PARTICIPANT, id: 2, user_id: 5, role: 'member', user: { id: 5, full_name: 'Awa Sarr', avatar_url: null } },
  ],
} as unknown as Conversation;

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ConversationInfoSheet open onClose={() => {}} conversation={GROUPE} currentMute={false} />
      </QueryClientProvider>,
    ),
  );
}

describe('<ConversationInfoSheet> — inviter un participant', () => {
  beforeEach(mockApi);
  afterEach(() => vi.unstubAllGlobals());

  it("ne demande plus d'identifiant numérique", () => {
    rendre();

    const champ = screen.getByLabelText('Inviter un participant');
    expect(champ).not.toHaveAttribute('type', 'number');
    expect(screen.queryByPlaceholderText('ID utilisateur')).not.toBeInTheDocument();
  });

  it('invite la personne choisie par son nom, et ne propose pas un membre déjà présent', async () => {
    const user = userEvent.setup();
    rendre();

    const champ = screen.getByLabelText('Inviter un participant');
    await user.click(champ);
    await screen.findByRole('option', { name: 'Moussa Ndiaye' });
    expect(screen.queryByRole('option', { name: 'Awa Sarr' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Moussa Ndiaye' }));

    await waitFor(() =>
      expect(
        appels.find(
          ({ url, method }) => method === 'POST' && url.pathname === '/api/conversations/12/participants',
        )?.body,
      ).toEqual({ user_ids: [6] }),
    );
  });

  /**
   * Relevé du vérificateur (2026-09-23) : la feuille lisait la liste d'un NOUVEAU groupe, et
   * proposait une personne que l'ajout à CE groupe refusait. Elle lit la règle du groupe.
   */
  it('cherche les personnes à inviter dans la règle de CE groupe', async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByLabelText('Inviter un participant'));
    await screen.findByRole('option', { name: 'Moussa Ndiaye' });

    const lectures = appels.filter(({ url }) => url.pathname.endsWith('/contacts'));
    expect(lectures.length).toBeGreaterThan(0);
    expect(lectures.every(({ url }) => url.pathname === '/api/conversations/12/contacts')).toBe(true);
    expect(lectures[0].url.searchParams.get('fields[users]')).toBe('id,first_name,last_name');
  });

  it("M13 — affiche la phrase de l'API, pas le résumé « (and 1 more error) » de la 422", async () => {
    const user = userEvent.setup();
    reponseAjout = {
      status: 422,
      corps: {
        message: 'Certaines personnes choisies ne peuvent pas être ajoutées. (and 1 more error)',
        errors: { user_ids: ['Certaines personnes choisies ne peuvent pas être ajoutées.'] },
      },
    };
    rendre();

    await user.click(screen.getByLabelText('Inviter un participant'));
    await user.click(await screen.findByRole('option', { name: 'Moussa Ndiaye' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Certaines personnes choisies ne peuvent pas être ajoutées.');
    expect(alerte).not.toHaveTextContent(/more error/);
  });
});
