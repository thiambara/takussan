import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { postRadarListings, radarKeys } from '@/lib/queries/radar';
import { withIntl } from '@/test/intl';
import { RadarIntakeSheet } from '../RadarIntakeSheet';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  postRadarListings: vi.fn(),
}));

function renderSheet() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <RadarIntakeSheet open onOpenChange={() => {}} />
    </QueryClientProvider>,
  ));
  return { invalidate };
}

beforeEach(() => {
  vi.mocked(postRadarListings).mockReset();
});

describe('RadarIntakeSheet (TCK-2386)', () => {
  it('envoie une URL par ligne, dit « créée » et « déjà saisie », se vide et reste ouvert', async () => {
    vi.mocked(postRadarListings).mockResolvedValue({
      data: [
        { id: 12, stage: 'captured', existing: false },
        { id: 7, stage: 'extracted', existing: true },
      ],
    });
    const { invalidate } = renderSheet();

    const champ = screen.getByLabelText('URL des annonces');
    await userEvent.type(champ, 'https://www.coinafrique.com/annonce/42{enter}{enter}  https://www.expat-dakar.com/annonce/9  ');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(postRadarListings).toHaveBeenCalledWith(
      { kind: 'urls', urls: ['https://www.coinafrique.com/annonce/42', 'https://www.expat-dakar.com/annonce/9'] },
      expect.anything(),
    );
    expect(await screen.findByText('Annonce n° 12 créée')).toBeInTheDocument();
    expect(screen.getByText('Annonce n° 7 déjà saisie')).toBeInTheDocument();
    expect(screen.getByText('https://www.expat-dakar.com/annonce/9')).toBeInTheDocument();
    expect(champ).toHaveValue('');
    expect(screen.getByRole('dialog', { name: 'Saisie rapide' })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: radarKeys.all });
  });

  it('envoie un texte avec son site', async () => {
    vi.mocked(postRadarListings).mockResolvedValue({ data: [{ id: 3, stage: 'captured', existing: false }] });
    renderSheet();

    await userEvent.click(screen.getByRole('tab', { name: 'Texte' }));
    const champ = await screen.findByLabelText('Texte de l’annonce');
    await userEvent.type(champ, 'Studio meublé à Ouakam, 150 000 F par mois, 77 123 45 67');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(postRadarListings).toHaveBeenCalledWith(
      { kind: 'text', text: 'Studio meublé à Ouakam, 150 000 F par mois, 77 123 45 67', sourceSite: 'other' },
      expect.anything(),
    );
    expect(await screen.findByText('Annonce n° 3 créée')).toBeInTheDocument();
    expect(champ).toHaveValue('');
  });

  it('envoie plusieurs captures', async () => {
    vi.mocked(postRadarListings).mockResolvedValue({ data: [{ id: 9, stage: 'captured', existing: true }] });
    renderSheet();

    await userEvent.click(screen.getByRole('tab', { name: 'Captures' }));
    const a = new File(['a'], 'capture-1.png', { type: 'image/png' });
    const b = new File(['b'], 'capture-2.jpg', { type: 'image/jpeg' });
    await userEvent.upload(await screen.findByLabelText('Captures d’écran'), [a, b]);
    expect(screen.getByText(/2 images choisies/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(postRadarListings).toHaveBeenCalledWith({ kind: 'captures', files: [a, b], sourceSite: 'other' }, expect.anything());
    expect(await screen.findByText('Annonce n° 9 déjà saisie')).toBeInTheDocument();
    expect(screen.getByText(/Aucune image choisie/)).toBeInTheDocument();
  });

  it('lit un refus 422 par son code, et garde la saisie', async () => {
    vi.mocked(postRadarListings).mockRejectedValue(
      new ApiError(422, { code: 'radar.url.airbnb', message: 'Airbnb refused (prose du serveur)' }),
    );
    renderSheet();

    const champ = screen.getByLabelText('URL des annonces');
    await userEvent.type(champ, 'https://www.airbnb.com/rooms/1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Les annonces Airbnb ne sont pas reprises : rien n’a été enregistré.')).toBeInTheDocument();
    expect(screen.queryByText(/prose du serveur/)).not.toBeInTheDocument();
    expect(champ).toHaveValue('https://www.airbnb.com/rooms/1');
  });

  it('une validation Laravel affiche ses messages', async () => {
    vi.mocked(postRadarListings).mockRejectedValue(
      new ApiError(422, { message: 'invalide', errors: { text: ['Le texte doit contenir au moins 20 caractères.'] } }),
    );
    renderSheet();

    await userEvent.click(screen.getByRole('tab', { name: 'Texte' }));
    await userEvent.type(await screen.findByLabelText('Texte de l’annonce'), 'trop court');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Le texte doit contenir au moins 20 caractères.')).toBeInTheDocument();
  });

  it('rien à envoyer : le bouton reste inactif', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});
