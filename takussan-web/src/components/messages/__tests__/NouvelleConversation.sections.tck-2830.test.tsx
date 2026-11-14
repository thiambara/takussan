/**
 * TCK-2830 — « Nouvelle conversation » rangée en sections (maquette `app-messagerie`, écran a-3) :
 * sans recherche, « Clients récents » · « Équipe » · « Propriétaires » · « Autres personnes », chacune
 * lue par `filter[relation]` côté SERVEUR, chaque personne avec sa ligne de détail composée ici
 * depuis les données (principe 5). Avec une recherche, une seule liste par pertinence.
 *
 * L'API est simulée au niveau de `fetch` : elle honore `filter[relation]`, `filter[search]` et
 * `sort=-last_exchange_at` comme le serveur (TCK-2745). Le front ne trie ni ne filtre rien lui-même :
 * une section vient de SA requête, jamais d'un tri d'une liste déjà reçue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { MessagingContact } from '@/lib/queries/conversations';
import { NouvelleConversation } from '../NouvelleConversation';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

type Personne = MessagingContact & { recent: number };

const AGENT: Personne[] = [
  { id: 1, name: 'Awa Ndiaye', avatar_url: null, relation: 'client', detail: { property: { title: 'Studio meublé', city: 'Mermoz' } }, recent: 2 },
  { id: 2, name: 'Malick Seck', avatar_url: null, relation: 'client', detail: { property: { title: 'Maison avec jardin', city: 'Thiès' } }, recent: 9 },
  { id: 3, name: 'Cheikh Mbaye', avatar_url: null, relation: 'client', detail: { property: null }, recent: 5 },
  { id: 4, name: 'Bineta Samb', avatar_url: null, relation: 'client', detail: { property: { title: 'Villa', city: null } }, recent: 1 },
  { id: 5, name: 'Awa Diop', avatar_url: null, relation: 'equipe', detail: { role: 'admin' }, recent: 0 },
  { id: 6, name: 'Ibrahima Fall', avatar_url: null, relation: 'equipe', detail: { role: 'agent' }, recent: 0 },
  { id: 7, name: 'Mouhamed Sène', avatar_url: null, relation: 'proprietaire', detail: { properties_count: 4 }, recent: 0 },
  { id: 8, name: 'Mame Diarra Gueye', avatar_url: null, relation: 'proprietaire', detail: { properties_count: 1 }, recent: 0 },
  { id: 9, name: 'Ibou Gaye', avatar_url: null, relation: 'prestataire', detail: null, recent: 0 },
  { id: 10, name: 'Khady Ba', avatar_url: null, relation: null, detail: null, recent: 0 },
];

/** Un bailleur : l'API ne lui rend jamais `proprietaire` ni `prestataire` (TCK-2745, règle 3). */
const BAILLEUR: Personne[] = [
  { id: 20, name: 'Moussa Ndiaye', avatar_url: null, relation: 'equipe', detail: { role: 'agent' }, recent: 0 },
  { id: 21, name: 'Omar Gueye', avatar_url: null, relation: null, detail: null, recent: 0 },
];

const FORTES = ['equipe', 'proprietaire', 'client'];
let perimetre: Personne[] = AGENT;
let agence: string | null = 'Dakar Immo';
let urls: URL[] = [];

function mockApi() {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      urls.push(url);
      // L'espace actif (`useMyProfiles`) : le nom de l'agence de l'équipe, lu par le front.
      if (url.pathname === '/api/me/profiles') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 3, type: 'agent', agency: { id: 1, name: agence } }], meta: { active_profile_id: 3 } }),
        };
      }
      let rendus = [...perimetre];
      const relation = url.searchParams.get('filter[relation]');
      if (relation === 'autre') rendus = rendus.filter((p) => !FORTES.includes(p.relation ?? ''));
      else if (relation !== null) rendus = rendus.filter((p) => p.relation === relation);
      const search = url.searchParams.get('filter[search]');
      if (search) rendus = rendus.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
      if (url.searchParams.get('sort') === '-last_exchange_at') rendus.sort((a, b) => b.recent - a.recent);
      const data = rendus.map(({ recent: _recent, ...p }) => p);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } }),
      };
    }),
  );
}

function monter(extra: { bureau?: boolean; onNouveauGroupe?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <NouvelleConversation open onClose={vi.fn()} onOuvrir={vi.fn()} onBrouillon={vi.fn()} {...extra} />
      </QueryClientProvider>,
    ),
  );
}

/** « nom | détail » d'une rangée : son nom accessible, puis sa description (sans les initiales). */
function rangee(bouton: HTMLElement) {
  const texte = (attr: string) => (bouton.getAttribute(attr) ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent).join(' ');
  const detail = texte('aria-describedby');
  return detail ? `${texte('aria-labelledby')} | ${detail}` : texte('aria-labelledby');
}

/** Les titres de section dans l'ordre de l'écran, et pour chacun ses rangées « nom | détail ». */
function sections() {
  return screen.getAllByRole('region').map((region) => ({
    titre: within(region).getByRole('heading').textContent,
    rangees: within(region).getAllByRole('button').map(rangee),
  }));
}

beforeEach(() => {
  perimetre = AGENT;
  agence = 'Dakar Immo';
  mockApi();
});
afterEach(() => vi.unstubAllGlobals());

describe('<NouvelleConversation> — rangée en sections (TCK-2830)', () => {
  it('AC1 — clients récents, équipe, propriétaires, puis les autres, chacun avec sa ligne de détail', async () => {
    monter();
    await screen.findByRole('heading', { name: 'Autres personnes' });
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(4));

    expect(sections()).toEqual([
      {
        titre: 'Clients récents',
        // Par dernier échange (le serveur), jamais par nom ; sans bien, aucune ligne ; sans ville, le titre seul.
        rangees: ['Malick Seck | Maison avec jardin · Thiès', 'Cheikh Mbaye', 'Awa Ndiaye | Studio meublé · Mermoz', 'Bineta Samb | Villa'],
      },
      { titre: 'Équipe', rangees: ['Awa Diop | Administrateur · Dakar Immo', 'Ibrahima Fall | Agent · Dakar Immo'] },
      { titre: 'Propriétaires', rangees: ['Mouhamed Sène | 4 biens gérés', 'Mame Diarra Gueye | 1 bien géré'] },
      { titre: 'Autres personnes', rangees: ['Ibou Gaye', 'Khady Ba'] },
    ]);
  });

  it('AC3 — chaque section part de sa requête filter[relation], avec le sparse fieldset des contacts', async () => {
    monter();
    await screen.findByRole('heading', { name: 'Autres personnes' });

    const lues = urls.filter((u) => u.pathname === '/api/conversations/contacts');
    const parSection = Object.fromEntries(lues.map((u) => [u.searchParams.get('filter[relation]'), u]));
    expect(Object.keys(parSection).sort()).toEqual(['autre', 'client', 'equipe', 'proprietaire']);
    for (const u of lues) {
      expect(u.searchParams.get('fields[users]')).toBe('id,first_name,last_name');
      expect(u.searchParams.get('filter[search]')).toBeNull();
    }
    expect(parSection.client.searchParams.get('sort')).toBe('-last_exchange_at');
    // Aucune liste « tout le périmètre » rangée ensuite côté client.
    expect(lues.every((u) => u.searchParams.get('filter[relation]') !== null)).toBe(true);
  });

  it('AC2 — un bailleur : aucune section « Propriétaires », le front n’en fabrique pas', async () => {
    perimetre = BAILLEUR;
    monter();
    await screen.findByRole('heading', { name: 'Autres personnes' });
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(2));

    expect(sections().map((s) => s.titre)).toEqual(['Équipe', 'Autres personnes']);
    expect(screen.queryByRole('heading', { name: 'Propriétaires' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Clients récents' })).not.toBeInTheDocument();
  });

  it('avec une recherche : une seule liste par pertinence, sans section, avec la ligne de détail', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByRole('heading', { name: 'Autres personnes' });

    await user.type(screen.getByRole('searchbox'), 'awa');
    await screen.findByRole('heading', { name: 'Personnes' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Clients récents' })).not.toBeInTheDocument());

    expect(screen.getAllByRole('region')).toHaveLength(1);
    const liste = screen.getByRole('region', { name: 'Personnes' });
    expect(within(liste).getAllByRole('button').map(rangee)).toEqual(['Awa Ndiaye | Studio meublé · Mermoz', 'Awa Diop | Administrateur · Dakar Immo']);
    const cherche = urls.filter((u) => u.searchParams.get('filter[search]') === 'awa');
    expect(cherche.length).toBeGreaterThan(0);
    expect(cherche.every((u) => u.searchParams.get('filter[relation]') === null)).toBe(true);
  });

  it('sans nom d’agence lisible, le rôle seul', async () => {
    agence = null;
    monter();
    expect(await screen.findByRole('button', { name: 'Ibrahima Fall' })).toHaveAccessibleDescription('Agent');
  });

  it('chaque rangée se nomme par le nom seul ; la ligne de détail la décrit', async () => {
    monter();
    const malick = await screen.findByRole('button', { name: 'Malick Seck' });
    expect(malick).toHaveAccessibleDescription('Maison avec jardin · Thiès');
  });

  it('au bureau, le rangement tient de part et d’autre du mode « groupe »', async () => {
    const user = userEvent.setup();
    monter({ bureau: true, onNouveauGroupe: vi.fn() });
    await screen.findByRole('heading', { name: 'Autres personnes' });

    await user.click(screen.getByRole('switch'));
    expect(screen.queryByRole('heading', { name: 'Clients récents' })).not.toBeInTheDocument();
    // Dans le formulaire du groupe, le sélecteur porte aussi la ligne de détail.
    await user.click(screen.getByLabelText('À'));
    expect(await screen.findByRole('option', { name: /Malick Seck/ })).toHaveTextContent('Maison avec jardin · Thiès');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(4));
    expect(sections().map((s) => s.titre)).toEqual(['Clients récents', 'Équipe', 'Propriétaires', 'Autres personnes']);
  });
});
