import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { CompteDeLaFiche } from '@/components/profile/fiche/ApercuDeLaFiche';
import type { FaitsPublicsDeLaFiche } from '@/lib/profil/faits-publics-de-la-fiche';
import type { MyProfilesResponse } from '@/types/profile';

/**
 * TCK-2862 — la fiche publique de l'agent : la jauge de complétude (cinq critères de 20 %) et l'aperçu
 * de la carte que voient les visiteurs, recomposé de la saisie AVANT tout enregistrement.
 */
const PROFILS = vi.hoisted(() => ({ current: undefined as MyProfilesResponse | undefined }));
vi.mock('@/hooks/useProfiles', () => ({
  profilesKeys: { all: ['me', 'profiles'] },
  useMyProfiles: () => ({ data: PROFILS.current, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 3 } }) }));
const API = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), apiRequest: API.apiRequest }));

import { ProfileAgentDirectorySection } from '../ProfileAgentDirectorySection';

const COURRIEL = 'sokhna.sene@dakarimmo.sn';

function profils(agent: Record<string, unknown>): MyProfilesResponse {
  return {
    data: [
      {
        id: 'agent:7',
        type: 'agent',
        numeric_id: 7,
        agency_id: 1,
        agency: { id: 1, name: 'Dakar Immo', slug: 'dakar-immo' },
        status: 'active',
        created_at: null,
        ...agent,
      },
    ],
    meta: { active_profile_id: 'agent:7', count: 1 },
  } as MyProfilesResponse;
}

const DEUX_QUARTIERS = { languages: ['fr'], neighborhood_ids: [21, 22], neighborhoods: [{ id: 21, name: 'Ngor' }, { id: 22, name: 'Almadies' }] };

const COMPTE: CompteDeLaFiche = {
  nom: 'Sokhna Sène',
  photo: 'https://cdn.exemple.sn/sokhna.jpg',
  presentation: 'Agent chez Dakar Immo depuis 2021.',
  telephoneVerifie: false,
};

function rendre(compte: CompteDeLaFiche = COMPTE, faitsPublics: FaitsPublicsDeLaFiche | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withIntl(<ProfileAgentDirectorySection compte={compte} faitsPublics={faitsPublics} />)}
    </QueryClientProvider>,
  );
}

const apercu = () => within(document.querySelector<HTMLElement>('[data-slot="apercu-de-la-fiche"]')!);

beforeEach(() => {
  vi.clearAllMocks();
  PROFILS.current = profils(DEUX_QUARTIERS);
  API.apiRequest.mockImplementation(async (chemin: string, options?: { method?: string; body?: unknown }) => {
    if (options?.method === 'PATCH') return { data: { id: 7, ...(options.body as object) } };
    if (chemin.startsWith('/api/public/geo/cities')) return { data: [{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar' }] };
    if (chemin.startsWith('/api/public/geo/neighborhoods')) {
      return {
        data: [
          { id: 21, city_id: 1, name: 'Ngor', slug: 'ngor', status: 'approved' },
          { id: 22, city_id: 1, name: 'Almadies', slug: 'almadies', status: 'approved' },
          { id: 23, city_id: 1, name: 'Mermoz', slug: 'mermoz', status: 'approved' },
        ],
      };
    }
    throw new Error(`appel inattendu : ${chemin}`);
  });
});

describe('TCK-2862 — la jauge de la fiche publique', () => {
  it('AC1 — photo, présentation, une langue, 2 quartiers sur 5, numéro non vérifié : 60 %, et ce qu’il reste', () => {
    rendre();
    const jauge = within(document.querySelector<HTMLElement>('[data-slot="jauge-de-la-fiche"]')!);
    expect(jauge.getByText('60 %')).toBeInTheDocument();
    expect(jauge.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(
      jauge.getByText('Les fiches complètes reçoivent plus de demandes. Il vous reste : 3 quartiers et votre numéro vérifié.'),
    ).toBeInTheDocument();
  });

  it('AC1 — les cinq critères remplis : 100 %, sans « Il vous reste »', () => {
    PROFILS.current = profils({
      languages: ['fr'],
      neighborhood_ids: [21, 22, 23, 24, 25],
      neighborhoods: [21, 22, 23, 24, 25].map((id) => ({ id, name: `Q${id}` })),
    });
    rendre({ ...COMPTE, telephoneVerifie: true });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100 %')).toBeInTheDocument();
    expect(screen.queryByText(/Il vous reste/)).not.toBeInTheDocument();
  });

  it('rien de rempli : 0 %', () => {
    PROFILS.current = profils({ languages: [], neighborhood_ids: [], neighborhoods: [] });
    rendre({ nom: 'Sokhna Sène', photo: null, presentation: null, telephoneVerifie: false });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('TCK-2862 — l’aperçu de la carte publique', () => {
  it('fiche non listée : nom, langues, quartiers ; note, délai et biens remplacés par « Visible après publication »', () => {
    rendre();
    const carte = apercu();
    expect(carte.getByText('Sokhna Sène')).toBeInTheDocument();
    expect(carte.getByText('Agent · Dakar Immo')).toBeInTheDocument();
    expect(carte.getByText('Français')).toBeInTheDocument();
    expect(carte.getByText('Ngor · Almadies')).toBeInTheDocument();
    expect(carte.getByText('Visible après publication de votre fiche')).toBeInTheDocument();
    expect(carte.queryByText('Réponse')).not.toBeInTheDocument();
    expect(carte.queryByText('Annonces')).not.toBeInTheDocument();
  });

  it('fiche listée : la note, le délai de réponse et les biens en ligne de la fiche publique', () => {
    PROFILS.current = profils({ ...DEUX_QUARTIERS, public_slug: 'sokhna-sene' });
    rendre(COMPTE, { note: { moyenne: 4.1, nombre: 12 }, delaiMinutes: 38, annonces: 25 });
    const carte = apercu();
    expect(carte.getByText('4,1')).toBeInTheDocument();
    expect(carte.getByText('· 12 avis')).toBeInTheDocument();
    expect(carte.getByText('en 38 min environ')).toBeInTheDocument();
    expect(carte.getByText('25 biens en ligne')).toBeInTheDocument();
    expect(carte.queryByText('Visible après publication de votre fiche')).not.toBeInTheDocument();
  });

  it('AC2 — ajouter « Mermoz » le fait paraître dans l’aperçu, et la jauge monte, sans enregistrer', async () => {
    const user = userEvent.setup();
    rendre();
    expect(apercu().queryByText(/Mermoz/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Ville'));
    await user.click(await screen.findByRole('option', { name: 'Dakar' }));
    await user.click(screen.getByLabelText('Quartiers'));
    await user.click(await screen.findByRole('option', { name: 'Mermoz' }));

    expect(apercu().getByText('Ngor · Almadies · Mermoz')).toBeInTheDocument();
    expect(screen.getByText(/Il vous reste : 2 quartiers et votre numéro vérifié\./)).toBeInTheDocument();
    expect(API.apiRequest.mock.calls.some(([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH')).toBe(false);
  });

  it('AC3 — l’aperçu suit le formulaire, et le lien « Voir ma fiche publique » est sous lui', () => {
    PROFILS.current = profils({ ...DEUX_QUARTIERS, public_slug: 'sokhna-sene' });
    rendre(COMPTE, { note: null, delaiMinutes: null, annonces: 0 });
    const formulaire = document.querySelector('form')!;
    const carte = document.querySelector('[data-slot="apercu-de-la-fiche"]')!;
    const lien = screen.getByRole('link', { name: 'Voir ma fiche publique' });
    expect(formulaire.compareDocumentPosition(carte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(carte.compareDocumentPosition(lien) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lien).toHaveAttribute('href', '/agents/sokhna-sene');
    // Au bureau, deux colonnes dès 1280 px, l'aperçu collant à droite.
    expect(document.querySelector('[data-slot="fiche-et-apercu"]')).toHaveClass('xl:grid-cols-[minmax(0,1fr)_340px]');
    expect(document.querySelector('[data-slot="apercu"]')).toHaveClass('xl:sticky');
  });

  it('AC4 — l’aperçu ne contient pas le courriel de l’agent ; WhatsApp n’y paraît qu’avec un numéro vérifié', () => {
    const { container } = rendre();
    expect(container.textContent).not.toContain(COURRIEL);
    expect(apercu().queryByText('WhatsApp')).not.toBeInTheDocument();
  });
});
