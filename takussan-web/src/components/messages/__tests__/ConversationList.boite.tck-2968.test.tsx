/**
 * TCK-2968 (ADR-0128 § 7) — la boîte de pilotage dans la liste : les puces de file partent au SERVEUR
 * (`filter[file]`) et leurs comptes lisent `meta.counts` ; les signaux d'une rangée ; les gestes au survol,
 * montés par la page seule ; « Traité » puis « Annuler » ; « Confier » pour une salle ou un groupe, par le
 * personnel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ConversationList } from '../ConversationList';
import { DUREE_DU_TOAST_MS, usePilotageDeLaBoite } from '../boite/PilotageDeLaBoite';

const appels: unknown[] = [];
let pages: unknown[] = [];
const traiter = vi.fn();
const annulerTraite = vi.fn();
const rappeler = vi.fn();
const ramener = vi.fn();
const confier = vi.fn();
vi.mock('@/lib/queries/conversations', () => ({
  useConversationsInfinite: (options: { filtres?: unknown }) => {
    appels.push(options?.filtres);
    return { data: { pages }, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() };
  },
  useGestesDeLaBoite: () => ({
    traiter: { mutate: traiter },
    annulerTraite: { mutate: annulerTraite },
    rappeler: { mutate: rappeler },
    ramener: { mutate: ramener },
    confier: { mutate: confier },
  }),
  useConversationContext: () => ({ data: contexte ? { data: contexte } : undefined }),
}));
let contexte: unknown;
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
let roles: string[] = ['agent'];
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles }, activeProfileId: null }) }));

const p = (id: number, nom: string) => ({ id: id + 100, user_id: id, role: 'member', last_read_at: null, joined_at: '', left_at: null, user: { id, full_name: nom, avatar_url: null } });
function fil(id: number, nom: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    subject: null,
    property_id: null,
    type: 'direct',
    status: 'active',
    maintenance_request_id: null,
    last_message_at: '2026-11-18T10:00:00Z',
    last_message_preview: 'Bonjour',
    unread_count: 0,
    participants: [p(1, 'Sokhna Sène'), p(2, nom)],
    last_message: { id: 1, type: 'text', metadata: null },
    file: 'ajour',
    ...extra,
  };
}
const COMPTES = { all: 14, unread: 3, group: 2, vous: 5, attente: 4, rappel: 1 };
const page = (data: unknown[], counts: Record<string, number> = COMPTES) => ({ data, meta: { current_page: 1, last_page: 1, counts, gestes: 5 } });

const puce = (nom: RegExp) => within(screen.getByRole('group', { name: 'Filtrer les conversations' })).getByRole('button', { name: nom });

/** La liste telle que la page la monte : avec les gestes de la boîte et leur rendu (toast, feuilles). */
function AvecLaBoite() {
  const boite = usePilotageDeLaBoite({ actif: true });
  return (
    <>
      <ConversationList selectedId={null} onSelect={() => {}} pilotage={boite.pilotage} />
      {boite.rendu}
    </>
  );
}

beforeEach(() => {
  roles = ['agent'];
  appels.length = 0;
  [traiter, annulerTraite, rappeler, ramener, confier].forEach((f) => f.mockReset());
  contexte = undefined;
  pages = [page([fil(1, 'Malick Seck', { file: 'vous', attend_depuis: new Date(Date.now() - 25 * 60_000).toISOString() })])];
});
afterEach(() => vi.useRealTimers());

describe('<ConversationList> — la boîte de pilotage (TCK-2968)', () => {
  // TCK-2973 — « Retard » rejoint la rangée (lot 3), après « À vous » ; son compte non nul est en ocre gras.
  it('les six puces, avec « Retard » et sans « Groupes » ; les comptes lisent `meta.counts`, pas la page', () => {
    pages = [page([], { ...COMPTES, retard: 2 })];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    const puces = within(screen.getByRole('group', { name: 'Filtrer les conversations' })).getAllByRole('button');
    expect(puces.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual(['Tous', 'Non lus', 'À vous', 'Retard', 'En attente', 'Rappels']);
    expect(screen.getByTestId('compte-retard')).toHaveTextContent('2');
    expect(screen.getByTestId('compte-retard').className).toContain('text-warning');
    expect(puce(/À vous/)).toHaveTextContent('5');
    expect(puce(/En attente/)).toHaveTextContent('4');
    expect(puce(/Rappels/)).toHaveTextContent('1');
  });

  it('chaque puce de file part au serveur en `file` ; « Tous » n’en envoie aucune', () => {
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    expect(appels.at(-1)).not.toHaveProperty('file');
    for (const [nom, file] of [[/À vous/, 'vous'], [/Retard/, 'retard'], [/En attente/, 'attente'], [/Rappels/, 'rappel']] as const) {
      fireEvent.click(puce(nom));
      expect(appels.at(-1)).toMatchObject({ file });
    }
    fireEvent.click(puce(/^Tous/));
    expect(appels.at(-1)).not.toHaveProperty('file');
  });

  it('une rangée dit sa file sous « Tous », et son délai ; au-delà de 4 h, le délai est dit dépassé', () => {
    pages = [page([fil(1, 'Malick Seck', { file: 'vous', attend_depuis: new Date(Date.now() - 5 * 3_600_000).toISOString() })])];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    const rangee = screen.getByRole('button', { name: /Malick Seck/ });
    expect(within(rangee).getByText('À vous')).toBeInTheDocument();
    expect(within(rangee).getByTestId('signaux-du-fil')).toHaveTextContent('depuis 5 h · au-delà de 4 h');
  });

  it('« En attente de » nomme le participant attendu ; « Confié à » ne se lit que du personnel', () => {
    pages = [page([fil(1, 'Bineta Sarr', { file: 'attente', en_attente_de: [2] }), fil(2, 'Awa Diop', { type: 'group', subject: 'Travaux', file: 'ajour', assigned_to: { id: 3, name: 'Ibrahima Fall' } })])];
    const { unmount } = render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    expect(screen.getByText('En attente de Bineta Sarr')).toBeInTheDocument();
    expect(screen.getByText('Confié à Ibrahima Fall')).toBeInTheDocument();
    unmount();
    roles = ['tenant'];
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    expect(screen.queryByText('Confié à Ibrahima Fall')).not.toBeInTheDocument();
  });

  it('sans `pilotage` (widget flottant, impersonation), aucun geste n’est rendu', () => {
    render(withIntl(<ConversationList selectedId={null} onSelect={() => {}} />));
    expect(screen.queryByTestId('gestes-au-survol')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Traité' })).not.toBeInTheDocument();
  });

  it('« Traité » puis « Annuler » : le geste part, le toast le dit, « Annuler » le défait', () => {
    traiter.mockImplementation((_v, o: { onSuccess: () => void }) => o.onSuccess());
    render(withIntl(<AvecLaBoite />));
    const gestes = screen.getByRole('group', { name: /Gestes sur « Malick Seck »/ });
    fireEvent.click(within(gestes).getByRole('button', { name: 'Traité' }));
    expect(traiter).toHaveBeenCalledWith({ id: 1 }, expect.anything());
    const toast = screen.getByTestId('toast-traite');
    expect(toast).toHaveTextContent('« Malick Seck » est traité.');
    fireEvent.click(within(toast).getByRole('button', { name: 'Annuler' }));
    expect(annulerTraite).toHaveBeenCalledWith({ id: 1 }, expect.anything());
    expect(screen.queryByTestId('toast-traite')).not.toBeInTheDocument();
  });

  it('le toast de « Traité » s’efface seul', () => {
    vi.useFakeTimers();
    traiter.mockImplementation((_v, o: { onSuccess: () => void }) => o.onSuccess());
    render(withIntl(<AvecLaBoite />));
    fireEvent.click(screen.getByRole('button', { name: 'Traité' }));
    expect(screen.getByTestId('toast-traite')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(DUREE_DU_TOAST_MS));
    expect(screen.queryByTestId('toast-traite')).not.toBeInTheDocument();
    expect(annulerTraite).not.toHaveBeenCalled();
  });

  it('« Rappelez-le-moi » ouvre les choix courts ; un choix envoie un instant futur', () => {
    render(withIntl(<AvecLaBoite />));
    fireEvent.click(screen.getByRole('button', { name: 'Rappelez-le-moi' }));
    const choix = within(screen.getByTestId('choix-de-rappel')).getAllByRole('button');
    expect(choix[0]).toHaveTextContent('Dans 1 heure');
    fireEvent.click(choix[0]!);
    const [vars] = rappeler.mock.calls[0]!;
    expect(vars.id).toBe(1);
    expect(Date.parse(vars.until)).toBeGreaterThan(Date.now());
  });

  it('« Rappels » : un fil mis de côté se ramène', () => {
    pages = [page([fil(1, 'Malick Seck', { file: 'rappel', snoozed_until: new Date(Date.now() + 3_600_000).toISOString() })])];
    render(withIntl(<AvecLaBoite />));
    fireEvent.click(screen.getByRole('button', { name: 'Ramener maintenant' }));
    expect(ramener).toHaveBeenCalledWith({ id: 1 }, expect.anything());
  });

  it('« Confier » : une salle ou un groupe, par le personnel ; jamais un fil direct, jamais un client', () => {
    pages = [page([fil(1, 'Malick Seck', { file: 'vous' }), fil(2, 'Awa Diop', { type: 'group', subject: 'Travaux', file: 'attente' })])];
    const { unmount } = render(withIntl(<AvecLaBoite />));
    expect(within(screen.getByRole('group', { name: /Malick Seck/ })).queryByRole('button', { name: 'Confier à un collègue' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: /Travaux/ })).getByRole('button', { name: 'Confier à un collègue' })).toBeInTheDocument();
    unmount();
    roles = ['tenant'];
    render(withIntl(<AvecLaBoite />));
    expect(screen.queryByRole('button', { name: 'Confier à un collègue' })).not.toBeInTheDocument();
  });

  it('le dialogue « Confier » liste les participants que l’API dit lecteurs des notes (`team_note_reader_ids`), et « Personne »', () => {
    const membres = [p(1, 'Sokhna Sène'), p(2, 'Awa Diop'), p(3, 'Ibrahima Fall'), p(4, 'Bineta Sarr')];
    pages = [page([fil(2, 'x', { type: 'group', subject: 'Travaux', file: 'attente', participants: membres })])];
    // Ibrahima est « agent » sans lire les notes ; Bineta est « propriétaire » et les lit : l'API tranche.
    contexte = {
      team_note_reader_ids: [1, 2, 4],
      can_write_team_note: true,
      participants: [
        { user_id: 1, relation: 'agent', reads_team_notes: true },
        { user_id: 2, relation: 'agent', reads_team_notes: true },
        { user_id: 3, relation: 'agent', reads_team_notes: false },
        { user_id: 4, relation: 'proprietaire', reads_team_notes: true },
      ],
    };
    render(withIntl(<AvecLaBoite />));
    fireEvent.click(screen.getByRole('button', { name: 'Confier à un collègue' }));
    const choix = within(screen.getByTestId('choix-du-collegue')).getAllByRole('button').map((b) => b.textContent?.replace(/^[A-Z]{2}/, ''));
    expect(choix).toEqual(['Sokhna Sène (vous)', 'Awa Diop', 'Bineta Sarr', 'Personne']);
    fireEvent.click(screen.getByRole('button', { name: /Awa Diop/ }));
    expect(confier).toHaveBeenCalledWith({ id: 2, userId: 2 }, expect.anything());
  });

  it('« À vous » vide : « Rien ne vous attend », et le chemin vers « En attente »', () => {
    pages = [page([])];
    render(withIntl(<AvecLaBoite />));
    fireEvent.click(puce(/À vous/));
    expect(screen.getByText('Rien ne vous attend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir « En attente » (4)' }));
    expect(appels.at(-1)).toMatchObject({ file: 'attente' });
    expect(screen.getByText('Aucune conversation en attente')).toBeInTheDocument();
  });
});
