import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminAnnouncement,
  fetchAdminAgencies,
  fetchAdminAnnouncements,
  patchAdminAnnouncement,
} from '@/lib/queries/super-admin';
import type { AdminAgenciesResponse, Announcement, AnnouncementsResponse } from '@/types/super-admin';
import { AnnouncementsConsole } from '../announcements';
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
    expect(payload.segment).toEqual({ roles: [], agency_ids: [], rollout_percentage: undefined });
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
      rollout_percentage: undefined,
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
});
