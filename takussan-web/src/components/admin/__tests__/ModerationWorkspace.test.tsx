import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import type { ModerationReview, ReviewRiskLevel } from '@/lib/queries/reviews-moderation';
import { ModerationWorkspace } from '../ModerationWorkspace';

/**
 * TCK-067 → TCK-376 → TCK-2673 — la file des avis, triée par RISQUE (maquette `app-moderation` B).
 *
 * Le serveur est simulé (`serveur`) : deux files, « à risque » et « sans risque », lues chacune par
 * `filter[risk]`, avec `meta.risk_counts` calculé avant ce filtre — comme `ReviewController::index`
 * (TCK-2672). Un lot publié les retire de la file, pour que la relecture le montre.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockFetchQueue = vi.fn();
const mockFetchReports = vi.fn();
const mockModerate = vi.fn();
const mockBatch = vi.fn();
const mockReply = vi.fn();

vi.mock('@/lib/queries/reviews-moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/reviews-moderation')>()),
  fetchModerationQueue: (...args: unknown[]) => mockFetchQueue(...args),
  fetchReviewReports: (...args: unknown[]) => mockFetchReports(...args),
  moderateReview: (...args: unknown[]) => mockModerate(...args),
  moderateReviewBatch: (...args: unknown[]) => mockBatch(...args),
  replyToReview: (...args: unknown[]) => mockReply(...args),
}));

vi.mock('@/lib/queries/agency-queues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/agency-queues')>()),
  propertyModerationCountQueryOptions: () => ({ queryKey: ['property-moderation', 'pending-count'], queryFn: async () => 1 }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
}));

/** La largeur simulée : téléphone (< 48rem), bureau sous `xl`, bureau à deux colonnes (≥ 80rem). */
let ecran: 'telephone' | 'moyen' | 'large' = 'large';
vi.mock('@/hooks/useMatchesMedia', () => ({
  useMatchesMedia: (q: string) => (q === '(width < 48rem)' ? ecran === 'telephone' : q === '(width >= 80rem)' ? ecran === 'large' : false),
}));

// TCK-376 — l'état de l'écran vit dans l'URL. `urlCourante` est ce que le composant LIT, `replace`
// et `push` ce qu'il ÉCRIT.
let urlCourante = '';
const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(urlCourante),
  usePathname: () => '/app/agency/moderation',
}));

// ─── Le serveur simulé ───────────────────────────────────────────────────────
type Avis = ModerationReview;
let serveur: { high: Avis[]; low: Avis[] } = { high: [], low: [] };

function avis(id: number, o: Partial<Avis> & { niveau?: ReviewRiskLevel; sujet?: string } = {}): Avis {
  const { niveau = 'low', sujet, ...reste } = o;
  return {
    id,
    rating: niveau === 'high' ? 2 : 5,
    title: null,
    content: `Texte de l’avis ${id}`,
    author: { id: 100 + id, name: `Auteur ${id}`, avatar_url: null },
    reviewable_type: 'App\\Models\\Property',
    reviewable_id: 99,
    status: 'pending',
    is_approved: false,
    reported_count: 0,
    created_at: '2026-11-10T10:00:00Z',
    can_moderate: true,
    can_reply: true,
    reply_content: null,
    replied_at: null,
    context_kind: null,
    target: {
      type: 'property',
      id: 99,
      title: sujet ?? `Villa ${id}`,
      slug: null,
      subtitle: 'T-99',
      photo_url: 'https://exemple.test/v.webp',
      agent: { id: 5, name: 'Awa Ndiaye' },
    },
    risk: { level: niveau, reasons: niveau === 'high' ? ['low_rating'] : [] },
    ...reste,
  } as Avis;
}
const plage = (de: number, n: number, o: Parameters<typeof avis>[1] = {}) => Array.from({ length: n }, (_, k) => avis(de + k, o));

function servir() {
  mockFetchQueue.mockImplementation(async (_jeton: string, p: { risk?: ReviewRiskLevel; page?: number; perPage?: number }) => {
    const liste = p.risk === 'high' ? serveur.high : serveur.low;
    const page = p.page ?? 1;
    const par = p.perPage ?? 20;
    return {
      data: liste.slice((page - 1) * par, page * par),
      meta: {
        total: liste.length,
        current_page: page,
        last_page: Math.max(1, Math.ceil(liste.length / par)),
        per_page: par,
        pending_count: serveur.high.length + serveur.low.length,
        risk_counts: { high: serveur.high.length, low: serveur.low.length },
      },
      links: { first: null, last: null, prev: null, next: null },
    };
  });
}

/** Les paramètres de la dernière lecture d'une file (20 par page) — ce qui part au serveur. */
function paramsDe(risk: ReviewRiskLevel) {
  const appel = mockFetchQueue.mock.calls.filter((c) => c[1]?.risk === risk && c[1]?.perPage === 20).at(-1);
  if (!appel) throw new Error(`aucune lecture de la file ${risk}`);
  return appel[1] as Record<string, unknown>;
}

function derniereUrl(): URLSearchParams {
  const appel = replace.mock.calls.at(-1);
  if (!appel) throw new Error('router.replace n’a pas été appelé');
  return new URLSearchParams(String(appel[0]).replace(/^[^?]*\?/, ''));
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  ecran = 'large';
  urlCourante = '';
  replace.mockReset();
  push.mockReset();
  mockFetchQueue.mockReset();
  mockFetchReports.mockReset();
  mockModerate.mockReset();
  mockBatch.mockReset();
  mockReply.mockReset();
  mockFetchReports.mockResolvedValue({ data: [], meta: { total: 0 } });
  serveur = { high: [avis(1, { niveau: 'high', sujet: 'Premier sujet' })], low: [avis(2, { sujet: 'Second sujet' })] };
  servir();
});

describe('<ModerationWorkspace> — décisions', () => {
  it('rend les deux groupes et, à deux colonnes, ouvre le premier avis', async () => {
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-queue-item-1')).toHaveTextContent('Premier sujet');
    expect(screen.getByTestId('moderation-queue-item-2')).toHaveTextContent('Second sujet');
    expect(screen.getByText('À regarder de près · 1')).toBeInTheDocument();
    expect(screen.getByText('Sans risque · 1')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-detail')).toHaveTextContent('Texte de l’avis 1');
  });

  it('« Publier » approuve sans demander de motif', async () => {
    mockModerate.mockResolvedValue({ data: avis(1) });
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    const detail = await screen.findByTestId('moderation-detail');
    await user.click(within(detail).getByRole('button', { name: /^publier$/i }));

    await waitFor(() => expect(mockModerate).toHaveBeenCalledWith(1, { decision: 'approve' }, 'fake-token'));
    expect(await screen.findByText('Avis publié.')).toBeInTheDocument();
  });

  it('« Publier avec la réponse » enregistre la réponse, puis publie', async () => {
    mockReply.mockResolvedValue({ data: avis(1) });
    mockModerate.mockResolvedValue({ data: avis(1) });
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace agencyName="Dakar Immo" />));

    const detail = await screen.findByTestId('moderation-detail');
    await user.type(within(detail).getByRole('textbox'), 'Merci pour votre retour.');
    expect(within(detail).getByText(/signée «\s?Dakar Immo\s?»/)).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Publier avec la réponse' }));

    await waitFor(() => expect(mockModerate).toHaveBeenCalledWith(1, { decision: 'approve' }, 'fake-token'));
    expect(mockReply).toHaveBeenCalledWith(1, 'Merci pour votre retour.', 'fake-token');
    expect(mockReply.mock.invocationCallOrder[0]).toBeLessThan(mockModerate.mock.invocationCallOrder[0]);
  });

  it('la réponse enregistrée mais l’avis non publié : le message le dit', async () => {
    mockReply.mockResolvedValue({ data: avis(1) });
    mockModerate.mockRejectedValue(new Error('réseau'));
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    const detail = await screen.findByTestId('moderation-detail');
    await user.type(within(detail).getByRole('textbox'), 'Merci.');
    await user.click(within(detail).getByRole('button', { name: 'Publier avec la réponse' }));
    expect(await within(detail).findByRole('alert')).toHaveTextContent(/Votre réponse est enregistrée, mais l’avis n’est pas encore publié/);
  });

  // TCK-597 (ADR-0043 §7) — le motif est un CODE choisi dans une liste traduite.
  it('supprimer (plateforme) exige un motif codé, le texte libre est facultatif', async () => {
    mockModerate.mockResolvedValue({ data: { id: 1, deleted: true } });
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace platform />));

    await screen.findByTestId('moderation-detail');
    await user.click(screen.getByRole('button', { name: /supprimer/i }));
    expect(await screen.findByTestId('moderation-confirm')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirmer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/choisissez un motif/i);
    expect(mockModerate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: 'Motif' }));
    expect(await screen.findAllByRole('option')).toHaveLength(9);
    await user.click(screen.getByRole('option', { name: 'Propos injurieux' }));
    await user.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() =>
      expect(mockModerate).toHaveBeenCalledWith(1, { decision: 'delete', reason_code: 'offensive', reason: undefined }, 'fake-token'),
    );
  });

  it('« Autre motif » exige le complément libre', async () => {
    mockModerate.mockResolvedValue({ data: avis(1) });
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-detail');
    await user.click(screen.getByRole('button', { name: /^masquer$/i }));
    await user.click(screen.getByRole('combobox', { name: 'Motif' }));
    await user.click(await screen.findByRole('option', { name: 'Autre motif' }));
    await user.click(screen.getByRole('button', { name: /confirmer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/raison est requise/i);
    expect(mockModerate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/précisez le motif/i), 'Publicité déguisée');
    await user.click(screen.getByRole('button', { name: /confirmer/i }));
    await waitFor(() =>
      expect(mockModerate).toHaveBeenCalledWith(1, { decision: 'hide', reason_code: 'other', reason: 'Publicité déguisée' }, 'fake-token'),
    );
  });

  // TCK-597 (ADR-0043 §1) — l'admin d'agence voit l'avis porté sur son agence, mais ne le tranche pas.
  it('agence : un avis sur l’agence elle-même est réservé à la plateforme, et l’écran le dit', async () => {
    serveur = { high: [avis(3, { can_moderate: false, reviewable_type: 'App\\Models\\Agency' })], low: [] };
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-platform-only')).toHaveTextContent(/modéré par la plateforme/i);
    expect(screen.getByTestId('moderation-agency-scope')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^publier$/i })).toBeNull();
  });

  // verif-597 M3 — l'agence ne tranche que l'avis en attente : publier ou masquer.
  it('agence : un avis en attente offre « Publier » et « Masquer », rien d’autre', async () => {
    serveur = { high: [avis(4, { niveau: 'high', reported_count: 2 })], low: [] };
    render(wrap(<ModerationWorkspace />));

    const detail = await screen.findByTestId('moderation-detail');
    expect(within(detail).getByRole('button', { name: /^publier$/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /^masquer$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ignorer/i })).toBeNull();
  });

  it('agence : un avis publié n’offre aucune décision, et l’écran dit pourquoi', async () => {
    urlCourante = 'filter[moderation_status]=approved';
    serveur = { high: [], low: [avis(5, { status: 'approved', can_moderate: false })] };
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-platform-only')).toHaveTextContent(/seule la plateforme peut le retirer/i);
    expect(screen.queryByRole('button', { name: /^masquer$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^publier$/i })).toBeNull();
  });

  // verif-597 m1 — un avis que l'API dit non tranchable par l'agence : aucun bouton.
  it('agence : un avis que l’API ne laisse pas trancher n’offre aucun bouton', async () => {
    serveur = { high: [avis(6, { can_moderate: false, reviewable_type: 'App\\Models\\Profiles\\ServiceProviderProfile' })], low: [] };
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-platform-only')).toHaveTextContent(/modéré par la plateforme/i);
    expect(screen.queryByRole('button', { name: /^publier$/i })).toBeNull();
  });

  it('plateforme : le super-admin tranche un avis sur une agence', async () => {
    serveur = { high: [avis(3, { reviewable_type: 'App\\Models\\Agency' })], low: [] };
    render(wrap(<ModerationWorkspace platform />));

    const detail = await screen.findByTestId('moderation-detail');
    expect(within(detail).getByRole('button', { name: /^publier$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('moderation-platform-only')).toBeNull();
    expect(screen.queryByTestId('moderation-agency-scope')).toBeNull();
  });

  it('AC4 — le détail d’un avis sur un bien montre sa photo et son titre, avec un lien vers sa fiche', async () => {
    render(wrap(<ModerationWorkspace />));
    const detail = await screen.findByTestId('moderation-detail');
    const lien = within(detail).getByRole('link', { name: 'Ouvrir la fiche : Premier sujet' });
    expect(lien).toHaveAttribute('href', '/app/properties/99');
    expect(lien.querySelector('img')).toHaveAttribute('src', 'https://exemple.test/v.webp');
    expect(lien).toHaveTextContent('Premier sujet');
  });
});

describe('<ModerationWorkspace> — le lot (TCK-2673)', () => {
  it('AC1 — téléphone : cocher 12 avis sans risque puis « Publier » envoie UN lot de 12 ; les cartes partent, le compte passe de 51 à 39', async () => {
    ecran = 'telephone';
    urlCourante = 'filter[risk]=low';
    serveur = { high: plage(1, 4, { niveau: 'high' }), low: plage(100, 51) };
    mockBatch.mockImplementation(async (ids: number[]) => {
      serveur.low = serveur.low.filter((a) => !ids.includes(a.id));
      return { data: { decision: 'approve', review_ids: ids, count: ids.length } };
    });
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    expect(screen.getByRole('button', { name: /Sans risque/ })).toHaveTextContent('51');
    const ids = plage(100, 12).map((a) => a.id);
    for (const id of ids) await user.click(screen.getByRole('checkbox', { name: `Cocher l’avis de Auteur ${id}` }));
    expect(screen.getByText('12 sélectionnés')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publier' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Sans risque/ })).toHaveTextContent('39'));
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch).toHaveBeenCalledWith(ids, 'fake-token');
    expect(mockModerate).not.toHaveBeenCalled();
    for (const id of ids) expect(screen.queryByTestId(`moderation-queue-item-${id}`)).toBeNull();
    expect(screen.getByTestId('moderation-queue-item-112')).toBeInTheDocument();
    expect(screen.getByText('12 avis publiés.')).toBeInTheDocument();
  });

  it('AC2 — sur « À risque », ni case ni barre de lot', async () => {
    ecran = 'telephone';
    serveur = { high: plage(1, 4, { niveau: 'high' }), low: plage(100, 5) };
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-1');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /tout cocher/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publier' })).toBeNull();
  });

  it('AC2 — bureau : les cartes à risque n’ont pas de case, les autres en ont une', async () => {
    serveur = { high: plage(1, 2, { niveau: 'high' }), low: plage(100, 2) };
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-1');
    expect(within(screen.getByTestId('moderation-queue-item-1')).queryByRole('checkbox')).toBeNull();
    expect(within(screen.getByTestId('moderation-queue-item-100')).getByRole('checkbox')).toBeInTheDocument();
  });

  it('« Tout cocher » coche tous les avis sans risque publiables, pages non lues comprises, et le lot les publie', async () => {
    serveur = { high: [], low: [...plage(100, 29), avis(200, { can_moderate: false })] };
    mockBatch.mockResolvedValue({ data: { decision: 'approve', review_ids: [], count: 29 } });
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    await user.click(screen.getByRole('button', { name: 'Tout cocher' }));
    const bouton = await screen.findByRole('button', { name: 'Publier la sélection · 29 avis' });
    // Une lecture à part, de 100 au plus, en attente et sans risque.
    expect(mockFetchQueue.mock.calls.some((c) => c[1]?.perPage === 100 && c[1]?.risk === 'low' && c[1]?.status === 'pending')).toBe(true);
    await user.click(bouton);
    await waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
    expect(mockBatch.mock.calls[0][0]).toHaveLength(29);
    expect(mockBatch.mock.calls[0][0]).not.toContain(200);
  });

  it('TCK-2673 d1 — un avis non publiable dans la file (sur l’agence) : « Tout cocher » passe à « Tout décocher », la case maîtresse est pleine', async () => {
    serveur = { high: [], low: [...plage(100, 3), avis(200, { can_moderate: false, reviewable_type: 'App\\Models\\Agency' })] };
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    await user.click(screen.getByRole('button', { name: 'Tout cocher' }));
    expect(await screen.findByRole('button', { name: 'Tout décocher' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cocher tous les avis sans risque' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Publier la sélection · 3 avis' })).toBeInTheDocument();
  });

  it('TCK-2673 d1 — téléphone : « Tout cocher (n) » ne compte que les avis publiables', async () => {
    ecran = 'telephone';
    urlCourante = 'filter[risk]=low';
    serveur = { high: [], low: [...plage(100, 3), avis(200, { can_moderate: false, reviewable_type: 'App\\Models\\Agency' })] };
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    expect(screen.getByRole('button', { name: 'Tout cocher (3)' })).toBeInTheDocument();
  });

  it('les cases cochées ne survivent pas à un changement de filtre : rien de ce qui a quitté l’écran ne se publierait', async () => {
    serveur = { high: [], low: plage(100, 3) };
    const user = userEvent.setup();
    const { rerender } = render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    await user.click(screen.getByRole('checkbox', { name: 'Cocher l’avis de Auteur 100' }));
    expect(screen.getByRole('button', { name: 'Publier la sélection · 1 avis' })).toBeInTheDocument();

    urlCourante = 'filter[reported]=1';
    rerender(wrap(<ModerationWorkspace />));
    await waitFor(() => expect(paramsDe('low')).toMatchObject({ reported: true }));
    await screen.findByTestId('moderation-queue-item-100');
    expect(screen.getByRole('button', { name: 'Publier la sélection · 0 avis' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Cocher l’avis de Auteur 100' })).toHaveAttribute('aria-checked', 'false');
  });

  it('un lot refusé (422) ne publie rien, relit la file et le dit', async () => {
    serveur = { high: [], low: plage(100, 3) };
    mockBatch.mockRejectedValue(new ApiError(422, { code: 'review.batch_not_moderatable', message: 'refus' }));
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    await user.click(screen.getByRole('checkbox', { name: 'Cocher l’avis de Auteur 100' }));
    const lectures = mockFetchQueue.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Publier la sélection · 1 avis' }));
    expect(await screen.findByText(/Rien n’a été publié : un des avis cochés a changé entre-temps/)).toBeInTheDocument();
    await waitFor(() => expect(mockFetchQueue.mock.calls.length).toBeGreaterThan(lectures));
  });

  it('le lot n’existe que pour la file en attente', async () => {
    urlCourante = 'filter[moderation_status]=flagged';
    serveur = { high: [], low: plage(100, 3, { status: 'flagged' }) };
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-100');
    expect(screen.queryByRole('checkbox', { name: /Cocher l’avis/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Publier la sélection/ })).toBeNull();
  });

  // Contre-vérification de fd3ae77b4 : le compte rendu par la lecture de « Tout cocher » (un avis
  // non publiable sur une page non lue) et sa remise à zéro au changement de filtre.
  it('TCK-2673 d1 — un avis non publiable sur une page non lue : « Tout cocher » passe à « Tout décocher »', async () => {
    serveur = { high: [], low: [...plage(100, 25), avis(200, { can_moderate: false, reviewable_type: 'App\\Models\\Agency' })] };
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-100');
    expect(screen.queryByTestId('moderation-queue-item-200')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tout cocher' }));
    expect(await screen.findByRole('button', { name: 'Publier la sélection · 25 avis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tout décocher' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cocher tous les avis sans risque' })).toHaveAttribute('aria-checked', 'true');
  });

  it('TCK-2673 d1 — le compte de « Tout cocher » ne survit pas à un changement de filtre', async () => {
    serveur = { high: [], low: [...plage(100, 3), avis(200, { can_moderate: false, reviewable_type: 'App\\Models\\Agency' })] };
    const user = userEvent.setup();
    const { rerender } = render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-100');
    await user.click(screen.getByRole('button', { name: 'Tout cocher' }));
    await screen.findByRole('button', { name: 'Tout décocher' });
    serveur = { high: [], low: plage(300, 5) };
    urlCourante = 'filter[reported]=1';
    rerender(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-300');
    for (const n of [300, 301, 302]) await user.click(screen.getByRole('checkbox', { name: `Cocher l’avis de Auteur ${n}` }));
    expect(screen.getByRole('button', { name: 'Publier la sélection · 3 avis' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tout décocher' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Cocher tous les avis sans risque' })).toHaveAttribute('aria-checked', 'mixed');
  });
});

describe('<ModerationWorkspace> — largeurs (TCK-2673)', () => {
  it('sous `xl`, rien ne s’ouvre seul, et toucher un avis l’ouvre à la place de la file (une entrée d’historique)', async () => {
    ecran = 'moyen';
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-1');
    expect(screen.queryByTestId('moderation-detail')).toBeNull();
    await user.click(within(screen.getByTestId('moderation-queue-item-2')).getByRole('button'));
    expect(push).toHaveBeenCalledWith('/app/agency/moderation?selected=2', { scroll: false });
  });

  it('sous `xl`, l’avis ouvert remplace la file, et « Retour à la file » la rend', async () => {
    ecran = 'moyen';
    urlCourante = 'selected=2&filter[reported]=1';
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-detail')).toHaveTextContent('Texte de l’avis 2');
    expect(screen.queryByTestId('moderation-queue-item-1')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Retour à la file/ }));
    expect(push).toHaveBeenCalledWith('/app/agency/moderation?filter%5Breported%5D=1', { scroll: false });
  });

  it('téléphone : l’avis ouvert est plein écran, sans la liste', async () => {
    ecran = 'telephone';
    urlCourante = 'selected=1';
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-detail')).toHaveTextContent('Texte de l’avis 1');
    expect(screen.queryByTestId('moderation-queue-item-1')).toBeNull();
  });

  it('à deux colonnes, ↓ ouvre l’avis suivant — mais pas depuis un champ de saisie', async () => {
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));
    const detail = await screen.findByTestId('moderation-detail');

    await user.click(within(detail).getByRole('textbox'));
    await user.keyboard('{ArrowDown}');
    expect(replace).not.toHaveBeenCalled();

    await user.click(screen.getByText('À regarder de près · 1'));
    await user.keyboard('{ArrowDown}');
    expect(derniereUrl().get('selected')).toBe('2');
  });

  it('bureau : onglets « Avis · Biens à valider » avec leurs comptes, et le compte du jour', async () => {
    serveur = { high: plage(1, 4, { niveau: 'high' }), low: plage(100, 51) };
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-1');
    expect(screen.getByRole('tab', { name: /Avis/ })).toHaveTextContent('55');
    expect(await screen.findByText('55 avis en attente, dont 4 à regarder de près · 1 bien à valider')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Biens à valider/ })).toHaveTextContent('1');
  });
});

/**
 * TCK-376 — l'état partageable de la file. TCK-2673 : l'URL nue vaut « En attente » (la file du
 * jour) ; « Tous les statuts » s'écrit `all` et n'est jamais envoyé. Les pages se lisent à la suite
 * (« Voir les N suivants ») au lieu d'une pagination : une sélection survit aux pages lues.
 */
describe('<ModerationWorkspace> — état d’URL (TCK-376)', () => {
  it('AC1 — rejoue les trois filtres portés par l’URL, pour les deux files', async () => {
    urlCourante = 'filter[moderation_status]=flagged&filter[subject_type]=App%5CModels%5CProperty&filter[reported]=1';
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    for (const risk of ['high', 'low'] as const) {
      expect(paramsDe(risk)).toEqual({ status: 'flagged', subjectType: 'App\\Models\\Property', reported: true, risk, page: 1, perPage: 20 });
    }
    expect(screen.getByRole('combobox', { name: 'Filtrer par statut' })).toHaveTextContent('Signalés');
    expect(screen.getByRole('combobox', { name: 'Type de sujet' })).toHaveTextContent('Biens');
    expect(screen.getByRole('checkbox', { name: /signalés seulement/i })).toBeChecked();
  });

  it('AC1 — l’URL nue lit la file EN ATTENTE, sans autre filtre', async () => {
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    expect(paramsDe('high')).toEqual({ status: 'pending', subjectType: undefined, reported: undefined, risk: 'high', page: 1, perPage: 20 });
    expect(screen.getByRole('combobox', { name: 'Filtrer par statut' })).toHaveTextContent('En attente');
    expect(screen.getByRole('combobox', { name: 'Type de sujet' })).toHaveTextContent('Tous les sujets');
    expect(screen.getByRole('checkbox', { name: /signalés seulement/i })).not.toBeChecked();
  });

  it('« Tous les statuts » s’écrit `all` dans l’URL, et n’envoie aucun statut', async () => {
    urlCourante = 'filter[moderation_status]=all';
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');
    expect(paramsDe('low').status).toBeUndefined();
    expect(screen.getByRole('combobox', { name: 'Filtrer par statut' })).toHaveTextContent('Tous les statuts');

    await user.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }));
    await user.click(await screen.findByRole('option', { name: 'En attente' }));
    expect(derniereUrl().has('filter[moderation_status]')).toBe(false);
  });

  it('AC1 — la sélection est portée par l’URL, et le clic l’y écrit', async () => {
    urlCourante = 'selected=2';
    render(wrap(<ModerationWorkspace />));

    expect(await screen.findByTestId('moderation-detail')).toHaveTextContent('Texte de l’avis 2');
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('moderation-queue-item-1')).getByRole('button'));
    expect(derniereUrl().get('selected')).toBe('1');
  });

  it('AC1 — cocher « signalés seulement » l’écrit dans l’URL ; décocher retire le paramètre', async () => {
    const user = userEvent.setup();
    const { unmount } = render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');
    await user.click(screen.getByRole('checkbox', { name: /signalés seulement/i }));
    expect(derniereUrl().get('filter[reported]')).toBe('1');
    unmount();

    urlCourante = 'filter[reported]=1';
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');
    await user.click(screen.getByRole('checkbox', { name: /signalés seulement/i }));
    expect(derniereUrl().has('filter[reported]')).toBe(false);
  });

  it('« Voir les N suivants » lit la page suivante de la même file', async () => {
    serveur = { high: plage(1, 25, { niveau: 'high' }), low: [] };
    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-20');
    expect(screen.queryByTestId('moderation-queue-item-21')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Voir les 5 suivants' }));
    expect(await screen.findByTestId('moderation-queue-item-25')).toBeInTheDocument();
    expect(paramsDe('high').page).toBe(2);
    expect(screen.queryByRole('button', { name: /Voir les \d+ suivants/ })).toBeNull();
  });

  // La revue adverse de TCK-363 : une table d'options amputée laissait tous les tests verts.
  it('les cinq statuts sont proposés, aucun de plus', async () => {
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Tous les statuts', 'En attente', 'Signalés', 'Approuvés', 'Rejetés']);
  });

  it('les quatre types de sujet sont proposés, et le choix part en FQCN au serveur', async () => {
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Type de sujet' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Tous les sujets', 'Biens', 'Agences', 'Utilisateurs']);

    await user.click(screen.getByRole('option', { name: 'Agences' }));
    expect(derniereUrl().get('filter[subject_type]')).toBe('App\\Models\\Agency');
  });
});
