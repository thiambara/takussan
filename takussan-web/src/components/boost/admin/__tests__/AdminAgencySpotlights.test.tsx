import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import {
  createAgencySpotlight,
  deleteAgencySpotlight,
  fetchAgencySpotlights,
  searchActiveAgencies,
} from '@/components/boost/admin/api';
import { AdminAgencySpotlights } from '../AdminAgencySpotlights';

vi.mock('@/components/boost/admin/api', () => ({
  fetchAgencySpotlights: vi.fn(),
  createAgencySpotlight: vi.fn(),
  deleteAgencySpotlight: vi.fn(),
  searchActiveAgencies: vi.fn(),
}));

vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({ data: { data: [{ id: 5, name: 'Dakar', slug: 'dakar', region_id: 1 }] }, isLoading: false }),
}));

// Le calendrier est une primitive éprouvée ailleurs : ici, seule la valeur qu'il rend compte.
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

function rendre(noeud: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{noeud}</QueryClientProvider>));
}

const PLACE = {
  id: 9,
  agency_id: 7,
  agency: { id: 7, name: 'Agence Teranga', slug: 'teranga', status: 'active' },
  geo_city_id: 5,
  city: { id: 5, name: 'Dakar' },
  starts_at: '2026-01-01T00:00:00+00:00',
  ends_at: '2099-01-01T00:00:00+00:00',
  note: 'Lancement',
  granted_by: { id: 1, name: 'Awa Ndiaye' },
} as const;

const META = { current_page: 1, last_page: 1, per_page: 25, total: 1 };

describe('AdminAgencySpotlights (TCK-2520)', () => {
  beforeEach(() => {
    vi.mocked(fetchAgencySpotlights).mockResolvedValue({ data: [PLACE], meta: META });
    vi.mocked(searchActiveAgencies).mockResolvedValue({ data: [{ id: 7, name: 'Agence Teranga' }] });
  });

  it('liste les places et en retire une après confirmation', async () => {
    vi.mocked(deleteAgencySpotlight).mockResolvedValue({ data: { id: 9, deleted: true } });
    const user = userEvent.setup();
    rendre(<AdminAgencySpotlights />);

    expect(await screen.findByText('Agence Teranga')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'En cours' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    await user.click(screen.getAllByRole('button', { name: 'Retirer' }).at(-1)!);

    await waitFor(() => expect(deleteAgencySpotlight).toHaveBeenCalledWith(9));
  });

  it('offre une place : agence choisie, tout l’annuaire, période inclusive convertie en fin exclue', async () => {
    vi.mocked(createAgencySpotlight).mockResolvedValue({ data: PLACE });
    const user = userEvent.setup();
    rendre(<AdminAgencySpotlights />);

    await user.type(screen.getByPlaceholderText('Nom de l’agence'), 'Teranga');
    await user.click(screen.getByRole('button', { name: 'Chercher' }));
    await user.click(await screen.findByRole('button', { name: 'Agence Teranga' }));
    await user.click(screen.getByLabelText('Ville'));
    await user.click(await screen.findByRole('option', { name: 'Tout l’annuaire (sans ville)' }));
    await user.type(screen.getByLabelText('Du'), '2026-12-01');
    await user.type(screen.getByLabelText('Au (inclus)'), '2026-12-07');
    await user.type(screen.getByLabelText('Motif (5 caractères au moins)'), 'Lancement de Thiès');
    await user.click(screen.getByRole('button', { name: 'Offrir' }));

    await waitFor(() =>
      expect(createAgencySpotlight).toHaveBeenCalledWith({
        agency_id: 7,
        geo_city_id: null,
        starts_at: '2026-12-01T00:00:00Z',
        ends_at: '2026-12-08T00:00:00Z',
        note: 'Lancement de Thiès',
      }),
    );
    expect(await screen.findByText('Mise en avant offerte.')).toBeInTheDocument();
  });

  it('affiche le refus d’un chevauchement tel que l’API le dit', async () => {
    vi.mocked(createAgencySpotlight).mockRejectedValue(
      new ApiError(422, { message: 'Une autre agence est déjà mise en avant sur cette ville pendant une partie de cette période.', errors: { starts_at: ['Une autre agence est déjà mise en avant sur cette ville pendant une partie de cette période.'] } }),
    );
    const user = userEvent.setup();
    rendre(<AdminAgencySpotlights />);

    await user.type(screen.getByPlaceholderText('Nom de l’agence'), 'Teranga');
    await user.click(screen.getByRole('button', { name: 'Chercher' }));
    await user.click(await screen.findByRole('button', { name: 'Agence Teranga' }));
    await user.click(screen.getByLabelText('Ville'));
    await user.click(await screen.findByRole('option', { name: 'Dakar' }));
    await user.type(screen.getByLabelText('Du'), '2026-12-01');
    await user.type(screen.getByLabelText('Au (inclus)'), '2026-12-07');
    await user.type(screen.getByLabelText('Motif (5 caractères au moins)'), 'Lancement');
    await user.click(screen.getByRole('button', { name: 'Offrir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('déjà mise en avant');
    expect(createAgencySpotlight).toHaveBeenCalledWith(expect.objectContaining({ geo_city_id: 5 }));
  });
});
