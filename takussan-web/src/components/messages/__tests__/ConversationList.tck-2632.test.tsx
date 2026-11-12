/**
 * TCK-2632 — la liste « les personnes d'abord » : la personne en titre (AC1), le bien en deuxième
 * ligne ; les puces « Tous · Non lus · Groupes » avec leurs comptes, et la recherche, filtrées par le
 * SERVEUR (AC2) — la liste ne filtre jamais la page chargée ; « Photo » pour une photo (AC7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ConversationList, DELAI_DE_RECHERCHE_MS } from '../ConversationList';
import { quandDansLaListe } from '../quand';

const appels: unknown[] = [];
let pages: unknown[] = [];
vi.mock('@/lib/queries/conversations', () => ({
  useConversationsInfinite: (options: { filtres?: unknown }) => {
    appels.push(options?.filtres);
    return {
      data: { pages },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  },
}));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
let roles: string[] = ['agent'];
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles } }) }));

const moi = { id: 10, user_id: 1, role: 'member', last_read_at: null, joined_at: '', left_at: null, user: { id: 1, full_name: 'Sokhna Sène', avatar_url: null } };
function directe(id: number, nom: string, bien: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    subject: null,
    property_id: bien ? 5 : null,
    type: 'direct',
    status: 'active',
    maintenance_request_id: null,
    last_message_at: '2026-11-12T10:00:00Z',
    last_message_preview: 'Et le prix est-il négociable ?',
    unread_count: 2,
    property: bien ? { id: 5, title: bien, slug: 'maison', main_photo_url: null } : undefined,
    participants: [moi, { id: 11, user_id: 2, role: 'member', last_read_at: null, joined_at: '', left_at: null, user: { id: 2, full_name: nom, avatar_url: null } }],
    last_message: { id: 1, type: 'text', metadata: null },
    ...extra,
  };
}
function page(data: unknown[], counts = { all: 10, unread: 2, group: 3 }) {
  return { data, meta: { current_page: 1, last_page: 1, counts } };
}

beforeEach(() => {
  roles = ['agent'];
  appels.length = 0;
  pages = [page([directe(1, 'Malick Seck', 'Maison avec jardin')])];
});
afterEach(() => vi.useRealTimers());

describe('<ConversationList> — les personnes d’abord (TCK-2632)', () => {
  it('AC1 — la première ligne dit la personne, le bien vient en deuxième', () => {
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    const rangee = screen.getByRole('button', { name: /Malick Seck/ });
    const lignes = [...rangee.querySelectorAll(':scope > span:last-child > span')].map((e) => e.textContent);
    expect(lignes[0]).toContain('Malick Seck');
    expect(lignes[1]).toBe('Maison avec jardin');
    expect(lignes[0]).not.toContain('Maison avec jardin');
  });

  it('un groupe : son nom, « Groupe · 5 personnes », et « +3 »', () => {
    const membres = [1, 2, 3, 4, 5].map((n) => ({ id: n, user_id: n, role: 'member', last_read_at: null, joined_at: '', left_at: null, user: { id: n, full_name: `P${n}`, avatar_url: null } }));
    pages = [page([{ ...directe(7, 'x', null), type: 'group', subject: 'Suivi des impayés', participants: membres }])];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    const rangee = screen.getByRole('button', { name: /Suivi des impayés/ });
    expect(within(rangee).getByText('Groupe')).toBeInTheDocument();
    expect(within(rangee).getByText('5 personnes')).toBeInTheDocument();
    expect(within(rangee).getByText('+3')).toBeInTheDocument();
  });

  it('les puces portent leurs comptes, et « Groupes » demande `type: group` au serveur', () => {
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    const groupes = screen.getByRole('button', { name: /Groupes/ });
    expect(groupes).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /Non lus/ })).toHaveTextContent('2');
    fireEvent.click(groupes);
    expect(groupes).toHaveAttribute('aria-pressed', 'true');
    expect(appels.at(-1)).toMatchObject({ type: 'group' });
    fireEvent.click(screen.getByRole('button', { name: /Non lus/ }));
    expect(appels.at(-1)).toMatchObject({ nonLus: true });
    expect(appels.at(-1)).not.toHaveProperty('type');
  });

  it('AC2 — la recherche part au serveur APRÈS le délai, et s’efface', () => {
    vi.useFakeTimers();
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    const champ = screen.getByRole('searchbox', { name: 'Chercher une conversation' });
    fireEvent.change(champ, { target: { value: 'thiès' } });
    expect(appels.at(-1)).toMatchObject({ recherche: '' });
    act(() => void vi.advanceTimersByTime(DELAI_DE_RECHERCHE_MS));
    expect(appels.at(-1)).toMatchObject({ recherche: 'thiès' });
    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    act(() => void vi.advanceTimersByTime(DELAI_DE_RECHERCHE_MS));
    expect(appels.at(-1)).toMatchObject({ recherche: '' });
  });

  it('la liste ne filtre pas la page : une rangée que le serveur rend reste affichée', () => {
    vi.useFakeTimers();
    pages = [page([directe(1, 'Malick Seck', 'Maison avec jardin'), directe(2, 'Awa Ndiaye', 'Studio meublé')])];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'thiès' } });
    act(() => void vi.advanceTimersByTime(DELAI_DE_RECHERCHE_MS));
    expect(screen.getByText('Awa Ndiaye')).toBeInTheDocument();
  });

  it('une recherche sans résultat le dit, sans l’état vide « Parcourir les annonces »', () => {
    vi.useFakeTimers();
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    pages = [page([])];
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    act(() => void vi.advanceTimersByTime(DELAI_DE_RECHERCHE_MS));
    expect(screen.getByText('Aucune conversation ne correspond.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parcourir les annonces' })).not.toBeInTheDocument();
  });

  it('AC7 — une photo se dit « Photo » dans la langue du lecteur, pas l’aperçu du serveur', () => {
    pages = [page([directe(1, 'Malick Seck', 'Maison', { last_message_preview: 'Fotó (langue de l’expéditeur)', last_message: { id: 3, type: 'image', metadata: null } })])];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />, 'en'));
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  it('le non-lu se lit : « 2 messages non lus »', () => {
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    expect(screen.getByText('2 messages non lus')).toBeInTheDocument();
  });
});

describe('<ConversationList> — l’état vide selon la personne (TCK-2632, AC6)', () => {
  beforeEach(() => {
    pages = [page([], { all: 0, unread: 0, group: 0 })];
  });

  it('l’agent : « Écrire à un client », qui ouvre « Nouvelle conversation »', () => {
    const onNouvelle = vi.fn();
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} onNouvelle={onNouvelle} />));
    expect(screen.getByText('Aucune conversation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Écrire à un client' }));
    expect(onNouvelle).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Parcourir les annonces' })).not.toBeInTheDocument();
  });

  it('le client garde « Parcourir les annonces »', () => {
    roles = ['customer'];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} onNouvelle={() => {}} />));
    expect(screen.getByRole('link', { name: 'Parcourir les annonces' })).toHaveAttribute('href', '/properties');
    expect(screen.queryByRole('button', { name: 'Écrire à un client' })).not.toBeInTheDocument();
  });

  it.each([['service_provider'], ['owner']])(
    'le %s lit d’où naissent ses fils, sans bouton vers les annonces ni vers un client',
    (role) => {
      roles = ['customer', role];
      render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} onNouvelle={() => {}} />));
      expect(screen.getByText(/naissent des interventions et des baux/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Parcourir les annonces' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Écrire à un client' })).not.toBeInTheDocument();
    },
  );
});

describe('quandDansLaListe (TCK-2632)', () => {
  const maintenant = new Date('2026-11-12T15:00:00Z');
  it('l’heure aujourd’hui, « Hier », le jour dans la semaine, la date au-delà', () => {
    expect(quandDansLaListe('2026-11-12T13:22:00Z', 'fr', 'Hier', maintenant)).toBe('13:22');
    expect(quandDansLaListe('2026-11-11T08:00:00Z', 'fr', 'Hier', maintenant)).toBe('Hier');
    expect(quandDansLaListe('2026-11-09T08:00:00Z', 'fr', 'Hier', maintenant)).toBe('lun.');
    expect(quandDansLaListe('2026-11-05T08:00:00Z', 'fr', 'Hier', maintenant)).toBe('5 nov.');
    expect(quandDansLaListe('2025-11-05T08:00:00Z', 'fr', 'Hier', maintenant)).toBe('5 nov. 2025');
    expect(quandDansLaListe(null, 'fr', 'Hier', maintenant)).toBe('');
  });
});
