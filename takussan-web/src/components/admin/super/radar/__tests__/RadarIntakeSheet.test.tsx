import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
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

/** Le test possède l'état d'ouverture : un panneau qui se fermerait seul le perdrait vraiment. */
function Harnais({ onOpenChange }: { readonly onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <RadarIntakeSheet
      open={open}
      onOpenChange={(suivant) => {
        onOpenChange(suivant);
        setOpen(suivant);
      }}
    />
  );
}

function renderSheet() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const onOpenChange = vi.fn();
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <Harnais onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  ));
  return { invalidate, onOpenChange };
}

function fichierDe(octets: number, nom: string): File {
  const f = new File(['x'], nom, { type: 'image/png' });
  Object.defineProperty(f, 'size', { value: octets });
  return f;
}

const MIO = 1024 * 1024;

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
    const { invalidate, onOpenChange } = renderSheet();

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
    expect(champ).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
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
    expect(champ).toHaveFocus();
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

  it('nomme l’URL refusée d’un lot par son rang (params.field, revue finale F7)', async () => {
    vi.mocked(postRadarListings).mockRejectedValue(
      new ApiError(422, { code: 'radar.url.airbnb', message: 'prose', params: { field: 'urls.1' } }),
    );
    renderSheet();

    await userEvent.type(screen.getByLabelText('URL des annonces'), 'https://www.coinafrique.com/a/1{enter}https://www.airbnb.com/rooms/1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(
      'Les annonces Airbnb ne sont pas reprises : rien n’a été enregistré. Adresse refusée : https://www.airbnb.com/rooms/1',
    )).toBeInTheDocument();
  });

  it('dit qu’une annonce déjà saisie dont l’extraction avait échoué est relancée (revue finale F2)', async () => {
    vi.mocked(postRadarListings).mockResolvedValue({ data: [{ id: 5, stage: 'captured', existing: true, requeued: true }] });
    renderSheet();

    await userEvent.type(screen.getByLabelText('URL des annonces'), 'https://www.coinafrique.com/a/5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Annonce n° 5 déjà saisie : extraction relancée')).toBeInTheDocument();
    expect(screen.queryByText('Annonce n° 5 déjà saisie')).not.toBeInTheDocument();
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

  it('refuse avant l’envoi des captures de plus de 24 Mo au total, sans rien envoyer', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('tab', { name: 'Captures' }));
    const lourdes = [fichierDe(8 * MIO, 'a.png'), fichierDe(8 * MIO, 'b.png'), fichierDe(8 * MIO, 'c.png'), fichierDe(MIO, 'd.png')];
    await userEvent.upload(await screen.findByLabelText('Captures d’écran'), lourdes);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Les images dépassent 24 Mo au total : envoyez-en moins à la fois. Rien n’a été envoyé.')).toBeInTheDocument();
    expect(postRadarListings).not.toHaveBeenCalled();
  });

  it('refuse avant l’envoi une image de plus de 8 Mo', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('tab', { name: 'Captures' }));
    await userEvent.upload(await screen.findByLabelText('Captures d’écran'), [fichierDe(8 * MIO + 1, 'a.png')]);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Une des images dépasse 8 Mo. Rien n’a été envoyé.')).toBeInTheDocument();
    expect(postRadarListings).not.toHaveBeenCalled();
  });

  it('un 413 du serveur a son libellé propre au Radar', async () => {
    vi.mocked(postRadarListings).mockRejectedValue(new ApiError(413, { code: 'payload_too_large' }));
    renderSheet();
    await userEvent.click(screen.getByRole('tab', { name: 'Captures' }));
    await userEvent.upload(await screen.findByLabelText('Captures d’écran'), [fichierDe(MIO, 'a.png')]);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('L’envoi est trop lourd pour le serveur : envoyez moins d’images à la fois (24 Mo au plus).')).toBeInTheDocument();
  });

  it('la zone de retour reste montée, et se vide quand on change d’onglet', async () => {
    vi.mocked(postRadarListings).mockResolvedValue({ data: [{ id: 12, stage: 'captured', existing: false }] });
    renderSheet();
    const zone = screen.getByRole('status');
    expect(zone).toBeEmptyDOMElement();

    await userEvent.type(screen.getByLabelText('URL des annonces'), 'https://www.coinafrique.com/annonce/42');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Annonce n° 12 créée')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(zone);

    await userEvent.click(screen.getByRole('tab', { name: 'Texte' }));
    expect(screen.queryByText('Annonce n° 12 créée')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(zone);
  });

  it('pendant un envoi, les onglets ne changent pas : le retour s’affiche sous l’onglet qui l’a envoyé', async () => {
    let resoudre!: (valeur: { data: { id: number; stage: 'captured'; existing: boolean }[] }) => void;
    vi.mocked(postRadarListings).mockReturnValue(new Promise((r) => { resoudre = r; }));
    renderSheet();

    await userEvent.type(screen.getByLabelText('URL des annonces'), 'https://www.coinafrique.com/annonce/42');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Texte' }));

    expect(screen.getByRole('tab', { name: 'URL' })).toHaveAttribute('aria-selected', 'true');
    resoudre({ data: [{ id: 12, stage: 'captured', existing: false }] });
    expect(await screen.findByText('Annonce n° 12 créée')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'URL' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('URL des annonces')).toBeVisible();
  });
});

