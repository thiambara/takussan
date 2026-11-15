/**
 * TCK-2910 — l'ajout au coffre au rangement IMPOSÉ : « Ajouter » de la carte Documents de la fiche d'un
 * bailleur dépose sur son profil (`owner_profile:{id}`, TCK-2909). Le document envoyé porte cette cible,
 * la catégorie « Mandat de gestion » part (le schéma la refusait), et aucune pièce KYC n'est proposée :
 * l'API les refuse sur un profil (422 `document.profile_piece_by_kyc`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

const envoi = vi.fn();
vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>('@/lib/queries/documents');
  return {
    ...actual,
    useUploadDocument: () => ({ mutateAsync: envoi, isPending: false }),
    // TCK-2898 — « Remplace … qui expire » envoie une version.
    useUploadDocumentVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

import { AjoutAuCoffre, type RangementImpose } from '../AjoutAuCoffre';

const IMPOSE: RangementImpose = { type: 'owner_profile', id: 5, nom: 'Mouhamed Sène', categories: ['management_mandate', 'insurance', 'other'], categorie: 'management_mandate' };
const onAjoute = vi.fn();

const fichier = (nom: string, type: string) => {
  const f = new File(['x'], nom, { type });
  Object.defineProperty(f, 'size', { value: 2048 });
  return f;
};
const entreeFichier = () => document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;

beforeEach(() => {
  envoi.mockReset().mockResolvedValue({ data: { id: 900 } });
  onAjoute.mockReset();
});

describe('TCK-2910 — l’ajout sur le profil du bailleur', () => {
  for (const bureau of [false, true]) {
    it(`le document envoyé porte la cible owner_profile:5 et la catégorie « mandat » (${bureau ? 'bureau' : 'téléphone'})`, async () => {
      ecran.bureau = bureau;
      render(withIntl(<AjoutAuCoffre open onOpenChange={vi.fn()} impose={IMPOSE} onAjoute={onAjoute} />));
      if (!bureau) expect(screen.getByText('Le document sera rangé dans « Mouhamed Sène ».')).toBeInTheDocument();
      fireEvent.change(entreeFichier(), { target: { files: [fichier('Mandat signé.pdf', 'application/pdf')] } });
      // Le dossier est imposé : nommé, sans « Changer ».
      expect(screen.getByTestId('range-dans')).toHaveTextContent('Mouhamed Sène');
      expect(screen.queryByRole('button', { name: 'Changer le dossier de rangement' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mandat de gestion' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter au coffre' }));
      await waitFor(() => expect(envoi).toHaveBeenCalledTimes(1));
      expect(envoi.mock.calls[0][0]).toMatchObject({ documentable_type: 'owner_profile', documentable_id: 5, type: 'management_mandate', name: 'Mandat signé' });
      await waitFor(() => expect(onAjoute).toHaveBeenCalled());
    });
  }

  it('aucune pièce KYC n’est proposée, ni en pastille ni dans « Plus de catégories »', () => {
    ecran.bureau = false;
    render(withIntl(<AjoutAuCoffre open onOpenChange={vi.fn()} impose={IMPOSE} />));
    fireEvent.change(entreeFichier(), { target: { files: [fichier('note.pdf', 'application/pdf')] } });
    expect(screen.queryByRole('button', { name: "Pièce d'identité" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plus de catégories' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Plus de catégories' }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Passeport');
    expect(options).not.toContain("Pièce d'identité");
    expect(options).not.toContain('RIB');
  });
});
