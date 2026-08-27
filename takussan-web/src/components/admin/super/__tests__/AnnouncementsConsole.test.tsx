import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminAnnouncement,
  fetchAdminAgencies,
  fetchAdminAnnouncements,
  patchAdminAnnouncement,
} from '@/lib/queries/super-admin';
import type { AdminAgenciesResponse, Announcement, AnnouncementsResponse } from '@/types/super-admin';
import { AnnouncementsConsole, announcementState, isoToLocalInput } from '../announcements';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  createAdminAnnouncement: vi.fn(),
  deactivateAdminAnnouncement: vi.fn(),
  fetchAdminAgencies: vi.fn(),
  fetchAdminAnnouncements: vi.fn(),
  patchAdminAnnouncement: vi.fn(),
}));

/**
 * Une annonce EN DIFFUSION : `is_active` vrai, `starts_at` dans le passé, pas de fin. C'est
 * exactement le prédicat de `scopeCurrentlyVisible()` côté API — un `starts_at` futur en ferait
 * une programmée et l'écran le dirait autrement.
 */
const enDiffusion: Announcement = {
  id: 7,
  title: { fr: 'Maintenance samedi', en: 'Maintenance on Saturday', wo: 'Maintenance ci gaawu' },
  body: { fr: 'Coupure de 2 h', en: '2 h outage', wo: 'Ñaari waxtu' },
  severity: 'warning',
  segment: { roles: ['agent'], agency_ids: [42, 4242], rollout_percentage: 25 },
  starts_at: '2026-08-01T08:00:00.000000Z',
  ends_at: null,
  is_active: true,
  created_by: 1,
  created_at: '2026-08-01T08:00:00.000000Z',
  updated_at: '2026-08-01T08:00:00.000000Z',
};

const brouillon: Announcement = {
  ...enDiffusion,
  id: 9,
  title: { fr: 'Nouvelle grille', en: 'New pricing', wo: 'Njëg yu bees' },
  body: { fr: 'À venir', en: 'Coming', wo: 'Muy ñëw' },
  severity: 'info',
  segment: {},
  is_active: false,
};

const agences: AdminAgenciesResponse = {
  data: [
    {
      id: 42,
      name: 'Agence Plateau',
      slug: 'agence-plateau',
      status: 'active',
      is_verified: true,
      verified_at: null,
      primary_admin_id: null,
      license_number: null,
      email: null,
      phone: null,
      logo_url: null,
      properties_count: 0,
      members_count: 0,
      last_activity_at: null,
      created_at: null,
    },
  ],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 100 },
};

/** L'API rend l'annonce écrite — le composant n'en relit rien, il invalide. */
const reponse = { data: { ...enDiffusion } };

function liste(annonces: Announcement[]): AnnouncementsResponse {
  return { data: annonces, meta: { total: annonces.length, current_page: 1, last_page: 1, per_page: 30 } };
}

function renderConsole() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(withIntl(
    <QueryClientProvider client={queryClient}><AnnouncementsConsole /></QueryClientProvider>,
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAdminAgencies).mockResolvedValue(agences);
  vi.mocked(patchAdminAnnouncement).mockResolvedValue(reponse);
  vi.mocked(createAdminAnnouncement).mockResolvedValue(reponse);
});

describe('console des annonces cross-tenant', () => {
  it('distingue une annonce en diffusion d’un brouillon, et résout le ciblage en noms', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([enDiffusion, brouillon]));
    renderConsole();

    expect(await screen.findByText('En diffusion')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();

    // Le ciblage est LU en clair : rôle traduit, agence connue nommée, agence inconnue en repli.
    const cible = await screen.findByText(/Rôles: Agent/);
    expect(cible).toHaveTextContent('Agences: Agence Plateau, Agence #4242');
    expect(cible).toHaveTextContent('25%');
  });

  it('édite une annonce EN DIFFUSION sans la désactiver, et préserve le ciblage intact', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([enDiffusion]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Maintenance samedi/i }));

    // L'écran DIT que l'annonce est diffusée, et ce que l'édition ne fera pas.
    expect(screen.getByRole('status')).toHaveTextContent(/en cours de diffusion/i);

    const titreFr = screen.getByLabelText('Titre FR');
    expect(titreFr).toHaveValue('Maintenance samedi');
    await user.clear(titreFr);
    await user.type(titreFr, 'Maintenance dimanche');

    await user.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));

    await waitFor(() => expect(patchAdminAnnouncement).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(patchAdminAnnouncement).mock.calls[0];
    expect(id).toBe(7);
    expect(payload.title).toEqual({
      fr: 'Maintenance dimanche',
      en: 'Maintenance on Saturday',
      wo: 'Maintenance ci gaawu',
    });
    // AC3 — le ciblage non touché repart À L'IDENTIQUE, y compris l'agence hors page chargée.
    expect(payload.segment).toEqual({ roles: ['agent'], agency_ids: [42, 4242], rollout_percentage: 25 });
    expect(payload.is_active).toBe(true);
    expect(payload.starts_at).toBe('2026-08-01T08:00:00.000Z');
    expect(createAdminAnnouncement).not.toHaveBeenCalled();
  });

  it('édite un brouillon et le laisse brouillon', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([brouillon]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Nouvelle grille/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/n'est pas diffusée/i);

    await user.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));

    await waitFor(() => expect(patchAdminAnnouncement).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(patchAdminAnnouncement).mock.calls[0];
    expect(id).toBe(9);
    expect(payload.is_active).toBe(false);
    // Une annonce SANS restriction atteint TOUT LE MONDE, et c'est la charge qui doit le dire.
    // Émettre `{roles: [], agency_ids: []}` ne dit pas « aucune restriction » à l'API : ce corps-là
    // ne matchait AUCUN destinataire (`AnnouncementResolver::matches()`), donc éditer une annonce
    // diffusée à tous la faisait disparaître pour 100 % des utilisateurs. L'assertion précédente
    // figeait exactement cette charge.
    expect(payload.segment).toEqual({});
    // ⚠ La clé `segment` reste PRÉSENTE : `update()` n'écrit que les clés reçues, donc l'omettre
    // rendrait impossible de retirer le ciblage d'une annonce qui en a un.
    expect(payload).toHaveProperty('segment');
  });

  it('retire tout le ciblage d’une annonce ciblée, et le DIT à l’API', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([enDiffusion]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Maintenance samedi/i }));

    // On décoche le rôle, on retire les deux agences, on vide le rollout : plus aucune restriction.
    await user.click(screen.getByRole('checkbox', { name: 'Agent' }));
    await user.click(screen.getByRole('button', { name: /Retirer Agence Plateau du ciblage/i }));
    await user.click(screen.getByRole('button', { name: /Retirer 4242 du ciblage/i }));
    await user.clear(screen.getByLabelText('Rollout %'));

    await user.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));

    await waitFor(() => expect(patchAdminAnnouncement).toHaveBeenCalledTimes(1));
    expect(vi.mocked(patchAdminAnnouncement).mock.calls[0][1].segment).toEqual({});
  });

  it('cherche une agence CÔTÉ SERVEUR au lieu de filtrer la page déjà chargée', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([brouillon]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Nouvelle grille/i }));
    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalled());
    expect(vi.mocked(fetchAdminAgencies).mock.calls[0][0]).toMatchObject({ search: undefined });

    // ⚠ L'agence cherchée peut être classée au-delà de la première page : filtrer côté client une
    // liste déjà tronquée faisait AFFIRMER « Aucune agence ne correspond » sur une agence qui
    // existe. La recherche doit donc partir en `filter[search]`, temporisée.
    vi.mocked(fetchAdminAgencies).mockResolvedValue({
      ...agences,
      data: [{ ...agences.data[0], id: 4242, name: 'Agence Saint-Louis' }],
      meta: { ...agences.meta, total: 1 },
    });
    await user.type(screen.getByLabelText('Rechercher une agence'), 'Saint');

    await waitFor(
      () => expect(
        vi.mocked(fetchAdminAgencies).mock.calls.some(([params]) => params?.search === 'Saint'),
      ).toBe(true),
      { timeout: 2000 },
    );
    expect(await screen.findByRole('checkbox', { name: 'Agence Saint-Louis' })).toBeInTheDocument();
  });

  it('coche une agence par son NOM et l’ajoute au ciblage', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([brouillon]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Nouvelle grille/i }));
    await user.click(await screen.findByRole('checkbox', { name: 'Agence Plateau' }));
    await user.click(screen.getByRole('checkbox', { name: 'Agent' }));

    await user.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));

    await waitFor(() => expect(patchAdminAnnouncement).toHaveBeenCalledTimes(1));
    expect(vi.mocked(patchAdminAnnouncement).mock.calls[0][1].segment).toEqual({
      roles: ['agent'],
      agency_ids: [42],
    });
  });

  it('sort du mode édition et retombe sur la création', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([enDiffusion]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Maintenance samedi/i }));
    await user.click(screen.getByRole('button', { name: /^Annuler$/ }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Titre FR')).toHaveValue('');

    expect(screen.getByRole('button', { name: /Publier l'annonce/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer les modifications/i })).not.toBeInTheDocument();
  });
  it('marque le champ de locale vidé au lieu de laisser l’API refuser en aveugle', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([enDiffusion]));
    const user = userEvent.setup();
    renderConsole();

    await user.click(await screen.findByRole('button', { name: /Éditer.*Maintenance samedi/i }));
    await user.clear(screen.getByLabelText('Titre WO'));
    await user.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));

    // L'API refusait déjà (422 `required_with`), mais le bandeau ne DISAIT PAS lequel des six
    // champs manquait. Rien ne part sur le fil, et le champ fautif est désigné.
    expect(patchAdminAnnouncement).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Titre WO')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Titre FR')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('alert')).toHaveTextContent('Ce champ est requis.');

    // La marque tombe dès que le champ est rempli — sans re-soumettre pour l'apprendre.
    await user.type(screen.getByLabelText('Titre WO'), 'Maintenance ci dibéer');
    expect(screen.getByLabelText('Titre WO')).not.toHaveAttribute('aria-invalid');
  });

  it('rend la sévérité TRADUITE dans la table, pas son slug', async () => {
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue(liste([enDiffusion]));
    renderConsole();

    await screen.findByText('Maintenance samedi');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Alerte')).toBeInTheDocument();
    expect(within(table).queryByText('warning')).not.toBeInTheDocument();
  });
});

/**
 * TCK-366 (revue) — les deux fonctions pures que le rendu ne peut pas éprouver seul.
 *
 * `announcementState` n'était éprouvée que sur `draft` et `live` : ses branches `scheduled` et
 * `expired` pouvaient être supprimées sans qu'un seul test rougisse. Et le correctif de fuseau
 * d'`isoToLocalInput` était invérifiable à travers le composant : la machine de développement
 * comme la CI sont à UTC+00, où la forme fautive rend la même chaîne.
 */
describe('les dérivations pures de la console', () => {
  const t = (iso: string) => new Date(iso).getTime();

  it('distingue les QUATRE états de diffusion', () => {
    const maintenant = t('2026-08-15T12:00:00.000Z');
    const base = { ...enDiffusion, is_active: true };

    expect(announcementState({ ...base, is_active: false }, maintenant)).toBe('draft');
    expect(announcementState({ ...base, starts_at: '2026-08-20T08:00:00.000Z' }, maintenant)).toBe('scheduled');
    expect(announcementState({ ...base, ends_at: '2026-08-10T08:00:00.000Z' }, maintenant)).toBe('expired');
    expect(announcementState({ ...base, ends_at: '2026-08-20T08:00:00.000Z' }, maintenant)).toBe('live');
  });

  it('rend l’heure LOCALE dans le champ, pas l’UTC — éprouvé sous un fuseau simulé', () => {
    // ⚠ `getTimezoneOffset` est la SEULE dépendance de la fonction au fuseau de la machine (le
    // reste passe par `toISOString`, qui est absolu). La simuler suffit donc à jouer un décalage
    // réel — et discrimine `toISOString().slice(0, 16)`, le bug d'origine, qui rendrait
    // '2026-08-01T08:00' dans les trois cas ci-dessous.
    const offset = vi.spyOn(Date.prototype, 'getTimezoneOffset');

    offset.mockReturnValue(-180); // UTC+03:00 — Nairobi
    expect(isoToLocalInput('2026-08-01T08:00:00.000000Z')).toBe('2026-08-01T11:00');

    offset.mockReturnValue(300); // UTC-05:00 — New York
    expect(isoToLocalInput('2026-08-01T08:00:00.000000Z')).toBe('2026-08-01T03:00');

    offset.mockReturnValue(0); // UTC+00:00 — Dakar, le fuseau de la machine et de la CI
    expect(isoToLocalInput('2026-08-01T08:00:00.000000Z')).toBe('2026-08-01T08:00');

    offset.mockRestore();
  });

  it('rend une chaîne vide sur une date absente ou illisible', () => {
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('pas-une-date')).toBe('');
  });
});
