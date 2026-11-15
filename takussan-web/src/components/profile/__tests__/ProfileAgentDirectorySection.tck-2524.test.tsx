import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import type { MyProfilesResponse } from '@/types/profile';

/**
 * TCK-2524 (AC3) — l'agent voit et enregistre SES langues et SES quartiers, sur son propre profil
 * (`PATCH /api/me/agent-profiles/{id}/directory`), relus de `GET /api/me/profiles`. Cinq quartiers au
 * plus ; un 422 se pose sur son champ.
 *
 * Les vrais hooks de mutation : seul `apiRequest` est doublé. Le référentiel (villes, quartiers) rend
 * Dakar et trois quartiers, dont un en attente de vérification — que le sélecteur ne propose pas.
 */
const PROFILS = vi.hoisted(() => ({
  current: undefined as MyProfilesResponse | undefined,
  etat: 'succes' as 'chargement' | 'erreur' | 'succes',
  refetch: (() => Promise.resolve()) as () => Promise<unknown>,
}));
vi.mock('@/hooks/useProfiles', () => ({
  profilesKeys: { all: ['me', 'profiles'] },
  useMyProfiles: () => ({
    data: PROFILS.etat === 'succes' ? PROFILS.current : undefined,
    isPending: PROFILS.etat === 'chargement',
    isError: PROFILS.etat === 'erreur',
    isFetching: false,
    refetch: PROFILS.refetch,
  }),
}));
const ROUTEUR = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 3 } }) }));
const API = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), apiRequest: API.apiRequest }));

import { ProfileAgentDirectorySection } from '../ProfileAgentDirectorySection';

function profils(agent: Record<string, unknown>): MyProfilesResponse {
  return {
    data: [
      { id: 'owner:4', type: 'owner', numeric_id: 4, agency_id: 1, status: 'active', created_at: null },
      { id: 'agent:7', type: 'agent', numeric_id: 7, agency_id: 1, status: 'active', created_at: null, ...agent },
    ],
    meta: { active_profile_id: 'agent:7', count: 2 },
  } as MyProfilesResponse;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<ProfileAgentDirectorySection />)}</QueryClientProvider>);
}

const ENREGISTRER = { name: 'Enregistrer' };

beforeEach(() => {
  vi.clearAllMocks();
  PROFILS.etat = 'succes';
  PROFILS.refetch = vi.fn(() => Promise.resolve());
  PROFILS.current = profils({ languages: ['fr'], neighborhood_ids: [21], neighborhoods: [{ id: 21, name: 'Ngor' }] });
  API.apiRequest.mockImplementation(async (chemin: string, options?: { method?: string; body?: unknown }) => {
    if (options?.method === 'PATCH') return { data: { id: 7, ...(options.body as object) } };
    if (chemin.startsWith('/api/public/geo/cities')) return { data: [{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar' }] };
    if (chemin.startsWith('/api/public/geo/neighborhoods')) {
      return {
        data: [
          { id: 21, city_id: 1, name: 'Ngor', slug: 'ngor', status: 'approved' },
          { id: 22, city_id: 1, name: 'Almadies', slug: 'almadies', status: 'approved' },
          { id: 23, city_id: 1, name: 'Quartier proposé', slug: 'propose', status: 'pending' },
          ...[24, 25, 26, 27].map((id) => ({ id, city_id: 1, name: `Q${id}`, slug: `q${id}`, status: 'approved' })),
        ],
      };
    }
    throw new Error(`appel inattendu : ${chemin}`);
  });
});

describe('ProfileAgentDirectorySection — langues et quartiers de l’agent (TCK-2524)', () => {
  it('relit ce que le profil porte : langues cochées, quartiers nommés', () => {
    rendre();
    expect(screen.getByRole('checkbox', { name: 'Français' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Wolof' })).not.toBeChecked();
    expect(screen.getByText('Ngor')).toBeInTheDocument();
    expect(screen.getByText('1 sur 5')).toBeInTheDocument();
  });

  it('propose les neuf langues de la liste fermée', () => {
    rendre();
    for (const nom of ['Français', 'Wolof', 'Anglais', 'Arabe', 'Peul (pulaar)', 'Espagnol', 'Portugais', 'Italien', 'Allemand']) {
      expect(screen.getByRole('checkbox', { name: nom })).toBeInTheDocument();
    }
  });

  it('AC3 — l’agent enregistre ses langues sur SON profil, quartiers renvoyés tels quels', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole('checkbox', { name: 'Wolof' }));
    await user.click(screen.getByRole('button', ENREGISTRER));

    await waitFor(() => expect(API.apiRequest).toHaveBeenCalledWith(
      '/api/me/agent-profiles/7/directory',
      expect.objectContaining({ method: 'PATCH', body: { languages: ['fr', 'wo'], neighborhood_ids: [21] } }),
    ));
    expect(await screen.findByText('Langues et quartiers enregistrés.')).toBeInTheDocument();
  });

  it('tout décocher part en listes vides — la fiche retire la ligne', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole('checkbox', { name: 'Français' }));
    await user.click(screen.getByRole('button', { name: 'Retirer Ngor' }));
    await user.click(screen.getByRole('button', ENREGISTRER));
    await waitFor(() => expect(API.apiRequest).toHaveBeenCalledWith(
      '/api/me/agent-profiles/7/directory',
      expect.objectContaining({ body: { languages: [], neighborhood_ids: [] } }),
    ));
  });

  it('un 422 se pose sur son champ, pas dans un bandeau', async () => {
    const user = userEvent.setup();
    API.apiRequest.mockImplementation(async (_c: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') {
        throw new ApiError(422, { message: 'Les données sont invalides.', errors: { 'neighborhood_ids.0': ['Ce quartier n’existe pas.'] } });
      }
      return { data: [] };
    });
    rendre();
    // TCK-2635 — « Enregistrer » n'est actif que sur une modification.
    await user.click(screen.getByRole('checkbox', { name: 'Anglais' }));
    await user.click(screen.getByRole('button', ENREGISTRER));
    expect(await screen.findByText('Ce quartier n’existe pas.')).toBeInTheDocument();
    expect(screen.queryByText('Les données sont invalides.')).not.toBeInTheDocument();
  });

  it('cinq quartiers au plus : un sixième est refusé avant l’envoi, et le dit', async () => {
    const user = userEvent.setup();
    PROFILS.current = profils({
      languages: [],
      neighborhoods: [21, 22, 24, 25, 26].map((id) => ({ id, name: id === 21 ? 'Ngor' : id === 22 ? 'Almadies' : `Q${id}` })),
    });
    rendre();
    expect(screen.getByText('5 sur 5')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Ville'));
    await user.click(await screen.findByRole('option', { name: 'Dakar' }));
    await user.click(screen.getByLabelText('Quartiers'));
    await user.click(await screen.findByRole('option', { name: 'Q27' }));

    expect(screen.getByText('5 sur 5')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('5 quartiers au plus');
    await user.keyboard('{Escape}');
    // Le refus n'a rien modifié : il n'y a rien à enregistrer (TCK-2635).
    expect(screen.getByRole('button', ENREGISTRER)).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Français' }));
    await user.click(screen.getByRole('button', ENREGISTRER));
    await waitFor(() => expect(API.apiRequest).toHaveBeenCalledWith(
      '/api/me/agent-profiles/7/directory',
      expect.objectContaining({ body: { languages: ['fr'], neighborhood_ids: [21, 22, 24, 25, 26] } }),
    ));
  });

  it('« Enregistrer » n’est actif que sur une modification, et la compte (TCK-2635)', async () => {
    const user = userEvent.setup();
    rendre();
    expect(screen.getByRole('button', ENREGISTRER)).toBeDisabled();
    expect(screen.queryByText(/modification non enregistrée/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Anglais' }));
    expect(screen.getByRole('button', ENREGISTRER)).toBeEnabled();
    expect(screen.getByText('1 modification non enregistrée')).toBeInTheDocument();
    // Revenir à la valeur enregistrée annule la modification.
    await user.click(screen.getByRole('checkbox', { name: 'Anglais' }));
    expect(screen.getByRole('button', ENREGISTRER)).toBeDisabled();
    expect(API.apiRequest.mock.calls.some(([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH')).toBe(false);
  });

  it('ne propose pas un quartier en attente de vérification', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByLabelText('Ville'));
    await user.click(await screen.findByRole('option', { name: 'Dakar' }));
    await user.click(screen.getByLabelText('Quartiers'));
    expect(await screen.findByRole('option', { name: 'Almadies' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Quartier proposé' })).not.toBeInTheDocument();
  });

  it('aucun fieldset ne s’élargit à son contenu (min-width: min-content par défaut)', () => {
    const { container } = rendre();
    const fieldsets = [...container.querySelectorAll('fieldset')];
    expect(fieldsets).toHaveLength(2);
    for (const f of fieldsets) expect(f).toHaveClass('min-w-0');
  });

  it('écrit le profil d’agent ACTIF : agent de deux agences, la seconde active', async () => {
    const user = userEvent.setup();
    PROFILS.current = {
      data: [
        { id: 'agent:7', type: 'agent', numeric_id: 7, agency_id: 1, status: 'active', created_at: null, languages: ['fr'], neighborhood_ids: [], neighborhoods: [] },
        { id: 'agent:9', type: 'agent', numeric_id: 9, agency_id: 2, status: 'active', created_at: null, languages: ['en'], neighborhood_ids: [22], neighborhoods: [{ id: 22, name: 'Almadies' }] },
      ],
      meta: { active_profile_id: 'agent:9', count: 2 },
    } as MyProfilesResponse;
    rendre();
    // Il LIT le profil actif…
    expect(screen.getByRole('checkbox', { name: 'Anglais' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Français' })).not.toBeChecked();
    expect(screen.getByText('Almadies')).toBeInTheDocument();
    // … et c'est lui qu'il ÉCRIT.
    await user.click(screen.getByRole('checkbox', { name: 'Anglais' }));
    await user.click(screen.getByRole('button', ENREGISTRER));
    await waitFor(() => expect(API.apiRequest).toHaveBeenCalledWith(
      '/api/me/agent-profiles/9/directory',
      expect.objectContaining({ method: 'PATCH', body: { languages: [], neighborhood_ids: [22] } }),
    ));
    expect(API.apiRequest.mock.calls.some(([c]) => c === '/api/me/agent-profiles/7/directory')).toBe(false);
  });

  it('une fiche enregistrée rafraîchit le cadre du profil : « À régler » se relit (TCK-2635)', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole('checkbox', { name: 'Anglais' }));
    await user.click(screen.getByRole('button', ENREGISTRER));
    await waitFor(() => expect(ROUTEUR.refresh).toHaveBeenCalledTimes(1));
  });

  it('pointe vers SA fiche publique quand elle existe, le dit quand elle n’est pas en ligne', () => {
    PROFILS.current = profils({ languages: [], neighborhood_ids: [], neighborhoods: [], public_slug: 'awa-diop' });
    const { unmount } = rendre();
    expect(screen.getByRole('link', { name: 'Voir ma fiche publique' })).toHaveAttribute('href', '/agents/awa-diop');
    unmount();

    PROFILS.current = profils({ languages: [], neighborhood_ids: [], neighborhoods: [], public_slug: null });
    rendre();
    expect(screen.queryByRole('link', { name: 'Voir ma fiche publique' })).not.toBeInTheDocument();
    expect(screen.getByText('Votre fiche publique n’est pas en ligne pour le moment.')).toBeInTheDocument();
  });

  it('pendant la lecture des profils, la section est là et le dit', () => {
    PROFILS.etat = 'chargement';
    rendre();
    expect(screen.getByRole('heading', { name: 'Sur votre fiche publique' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de votre fiche publique…');
  });

  it('si la lecture échoue, la section le dit et propose de réessayer', async () => {
    const user = userEvent.setup();
    PROFILS.etat = 'erreur';
    rendre();
    expect(screen.getByRole('heading', { name: 'Sur votre fiche publique' })).toBeInTheDocument();
    expect(screen.getByText('Vos langues et vos quartiers n’ont pas pu être chargés.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(PROFILS.refetch).toHaveBeenCalledTimes(1);
  });

  it('un compte sans profil d’agent ne voit rien', () => {
    PROFILS.current = { data: [{ id: 'owner:4', type: 'owner', numeric_id: 4, agency_id: 1, status: 'active', created_at: null }], meta: { active_profile_id: 'owner:4', count: 1 } } as MyProfilesResponse;
    const { container } = rendre();
    expect(container).toBeEmptyDOMElement();
  });
});
