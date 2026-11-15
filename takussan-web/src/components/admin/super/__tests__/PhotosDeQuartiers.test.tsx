import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import {
  envoyerPhoto,
  importerDeWikimedia,
  lirePropositionsWikimedia,
  listerQuartiersApprouves,
  retirerPhoto,
  type QuartierApprouve,
} from '@/lib/queries/super-admin-photos-de-quartier';
import { withIntl } from '@/test/intl';
import { PhotosDeQuartiers } from '../PhotosDeQuartiers';

vi.mock('@/lib/queries/super-admin-photos-de-quartier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/super-admin-photos-de-quartier')>()),
  listerQuartiersApprouves: vi.fn(),
  lirePropositionsWikimedia: vi.fn(),
  envoyerPhoto: vi.fn(),
  importerDeWikimedia: vi.fn(),
  retirerPhoto: vi.fn(),
}));
// Le référentiel des villes : jamais l'API locale depuis un test.
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: () => ({ data: { data: [{ id: 3, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: null, longitude: null }] }, isLoading: false }),
}));

/**
 * TCK-2844 (AC8, ADR-0109) — la console des photos de quartier : l'aperçu comme la tuile de
 * l'accueil, l'import d'une proposition Wikimedia en un clic, Unsplash en nouvel onglet, les
 * refus de l'API traduits.
 */
const PHOTO = 'https://media.takussan.com/9/conversions/mermoz-display.webp';
const MERMOZ: QuartierApprouve = { id: 41, nom: 'Mermoz', ville: 'Dakar', adresses: 37, photo: null };
const SACRE_COEUR: QuartierApprouve = { id: 42, nom: 'Sacré-Cœur', ville: 'Dakar', adresses: 12, photo: { url: PHOTO, source: 'upload' } };
const META = { total: 2, per_page: 24, current_page: 1, last_page: 1 };

const PROPOSITION = {
  title: 'File:Mermoz Dakar.jpg',
  thumb_url: 'https://upload.wikimedia.org/thumb/mermoz.jpg',
  width: 1600,
  height: 1200,
  author: null,
  license: 'CC0',
  page_url: 'https://commons.wikimedia.org/wiki/File:Mermoz_Dakar.jpg',
};

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <PhotosDeQuartiers />
    </QueryClientProvider>,
  ));
}

async function ligne(nom: string) {
  return screen.findByRole('listitem', { name: nom });
}

describe('<PhotosDeQuartiers /> — TCK-2844', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listerQuartiersApprouves).mockResolvedValue({ data: [MERMOZ, SACRE_COEUR], meta: META });
    vi.mocked(lirePropositionsWikimedia).mockResolvedValue({ data: [PROPOSITION], indisponible: false });
    vi.mocked(importerDeWikimedia).mockResolvedValue({ ...MERMOZ, photo: { url: PHOTO, source: 'wikimedia' } });
    vi.mocked(envoyerPhoto).mockResolvedValue({ ...MERMOZ, photo: { url: PHOTO, source: 'upload' } });
    vi.mocked(retirerPhoto).mockResolvedValue(undefined);
  });

  it('liste les approuvés, les plus fournis d’abord, chacun vu comme sa tuile', async () => {
    monter();

    const sacreCoeur = await ligne('Sacré-Cœur');
    expect(listerQuartiersApprouves).toHaveBeenCalledWith({ villeId: null, recherche: '', page: 1 });
    // Avec photo : la photo de la tuile ; sans : le motif.
    expect(sacreCoeur.querySelector('img')).not.toBeNull();
    expect(within(sacreCoeur).getByTestId('degrade-de-tuile')).toBeInTheDocument();
    const mermoz = await ligne('Mermoz');
    expect(within(mermoz).getByTestId('motif-de-tuile')).toBeInTheDocument();
    expect(within(mermoz).getAllByText('37 adresses').length).toBeGreaterThan(0);
  });

  it('la recherche par nom part au serveur, page 1', async () => {
    const user = userEvent.setup();
    monter();
    await ligne('Mermoz');

    await user.type(screen.getByLabelText('Rechercher un quartier'), 'mer');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    await waitFor(() => expect(listerQuartiersApprouves).toHaveBeenLastCalledWith({ villeId: null, recherche: 'mer', page: 1 }));
  });

  it('le choix d’une ville filtre côté serveur (`filter[geo_city_id]`), page 1', async () => {
    const user = userEvent.setup();
    monter();
    await ligne('Mermoz');

    await user.click(screen.getByLabelText('Ville'));
    await user.click(await screen.findByRole('option', { name: 'Dakar' }));

    await waitFor(() => expect(listerQuartiersApprouves).toHaveBeenLastCalledWith({ villeId: 3, recherche: '', page: 1 }));
  });

  it('AC8 — une proposition Wikimedia s’importe en un clic, par son titre', async () => {
    const user = userEvent.setup();
    monter();
    const l = await ligne('Mermoz');

    await user.click(within(l).getByRole('button', { name: 'Propositions Wikimedia' }));
    expect(lirePropositionsWikimedia).toHaveBeenCalledWith(41);
    await user.click(await within(l).findByRole('button', { name: 'Importer Mermoz Dakar.jpg' }));

    expect(importerDeWikimedia).toHaveBeenCalledWith(41, 'File:Mermoz Dakar.jpg');
    expect(await within(l).findByRole('status')).toHaveTextContent('Photo importée.');
    // La liste est relue.
    await waitFor(() => expect(listerQuartiersApprouves).toHaveBeenCalledTimes(2));
  });

  it('Wikimedia indisponible : une phrase, et l’envoi et Unsplash restent là', async () => {
    vi.mocked(lirePropositionsWikimedia).mockResolvedValue({ data: [], indisponible: true });
    const user = userEvent.setup();
    monter();
    const l = await ligne('Mermoz');

    await user.click(within(l).getByRole('button', { name: 'Propositions Wikimedia' }));

    expect(await within(l).findByText(/Wikimedia ne répond pas pour le moment/)).toBeInTheDocument();
    expect(within(l).getByRole('button', { name: 'Envoyer une photo' })).toBeEnabled();
    expect(within(l).getByRole('link', { name: /Chercher sur Unsplash/ })).toBeInTheDocument();
  });

  it('aucune proposition : une autre phrase', async () => {
    vi.mocked(lirePropositionsWikimedia).mockResolvedValue({ data: [], indisponible: false });
    const user = userEvent.setup();
    monter();
    const l = await ligne('Mermoz');

    await user.click(within(l).getByRole('button', { name: 'Propositions Wikimedia' }));

    expect(await within(l).findByText(/aucune photo libre de crédit/)).toBeInTheDocument();
  });

  it('AC8 — « Chercher sur Unsplash » ouvre unsplash.com en nouvel onglet, sur le quartier et la ville', async () => {
    monter();
    const l = await ligne('Sacré-Cœur');

    const lien = within(l).getByRole('link', { name: /Chercher sur Unsplash/ });
    expect(lien).toHaveAttribute('href', 'https://unsplash.com/s/photos/sacre-coeur-dakar');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    ['geo_cover.not_approved', 422, 'Ce quartier n’est plus approuvé : sa photo ne peut pas être modifiée.'],
    ['geo_cover.attribution_required', 422, 'Cette photo exige désormais un crédit : elle ne peut pas être importée.'],
    ['geo_cover.source_not_found', 422, 'Cette photo n’existe plus sur Wikimedia Commons.'],
    ['geo_cover.source_unavailable', 503, 'Wikimedia Commons ne répond pas : réessayez plus tard ou envoyez un fichier.'],
  ])('un refus %s de l’API est traduit', async (code, status, texte) => {
    vi.mocked(importerDeWikimedia).mockRejectedValue(new ApiError(status, { code, message: 'Prose du serveur' }));
    const user = userEvent.setup();
    monter();
    const l = await ligne('Mermoz');

    await user.click(within(l).getByRole('button', { name: 'Propositions Wikimedia' }));
    await user.click(await within(l).findByRole('button', { name: 'Importer Mermoz Dakar.jpg' }));

    expect(await within(l).findByRole('alert')).toHaveTextContent(texte);
  });

  it('l’envoi d’un fichier valide part ; un mauvais type est refusé sans appel', async () => {
    const user = userEvent.setup({ applyAccept: false });
    monter();
    const l = await ligne('Mermoz');
    const champ = within(l).getByLabelText(/Photo de Mermoz/);

    await user.upload(champ, new File(['x'], 'mermoz.gif', { type: 'image/gif' }));
    expect(await within(l).findByRole('alert')).toHaveTextContent('Format refusé');
    expect(envoyerPhoto).not.toHaveBeenCalled();

    const bon = new File(['x'], 'mermoz.jpg', { type: 'image/jpeg' });
    await user.upload(champ, bon);
    await waitFor(() => expect(envoyerPhoto).toHaveBeenCalledWith(41, bon));
    expect(await within(l).findByRole('status')).toHaveTextContent('Photo enregistrée.');
  });

  it('« Retirer » demande confirmation avant le DELETE', async () => {
    const user = userEvent.setup();
    monter();
    const l = await ligne('Sacré-Cœur');

    await user.click(within(l).getByRole('button', { name: 'Retirer' }));
    expect(retirerPhoto).not.toHaveBeenCalled();
    await user.click(within(l).getByRole('button', { name: 'Retirer la photo' }));

    await waitFor(() => expect(retirerPhoto).toHaveBeenCalledWith(42));
    expect(await within(l).findByRole('status')).toHaveTextContent('Photo retirée.');
  });

  it('un quartier sans photo n’offre pas « Retirer »', async () => {
    monter();
    const l = await ligne('Mermoz');
    expect(within(l).queryByRole('button', { name: 'Retirer' })).toBeNull();
  });
});
