/**
 * TCK-2879 (ADR-0110 § 2) — dans la section Dossier de sa fiche, le CLIENT dépose chaque pièce
 * manquante : « Prendre une photo » au téléphone, « Déposer » un fichier au bureau. Le dépôt appelle la
 * route du dossier (TCK-2872) ; le personnel, lui, n'a que « Demander ».
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { PiecesDuDossier } from '../dossier';

const etat = vi.hoisted(() => ({ deposer: vi.fn() }));
vi.mock('@/lib/queries/booking-dossier', () => ({
  useDossierDeLaReservation: () => ({
    isPending: false,
    isError: false,
    data: {
      data: {
        received: 1,
        required: 2,
        missing: ['employment_certificate'],
        pieces: [
          { piece: 'identity', required: true, received: true, received_at: '2026-11-13T10:00:00Z', requested_at: null, document: { id: 5, name: 'cni.pdf', type: 'id_card', created_at: '2026-11-13T10:00:00Z' } },
          { piece: 'employment_certificate', required: true, received: false, received_at: null, requested_at: null, document: null },
        ],
      },
    },
  }),
  useDemanderUnePiece: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/booking-gestes-du-client', async (orig) => ({
  ...(await orig<object>()),
  useDeposerUnePiece: () => ({ mutateAsync: etat.deposer, isPending: false }),
}));

const maintenant = new Date('2026-11-15T10:00:00Z');
const nom = fr.bookings.fiche.dossier.pieces.employment_certificate;
// TCK-3007 — les gestes viennent des `abilities` : le personnel demande (`request_dossier_piece`), le client
// dépose (`upload_dossier_piece` sans « Demander »), le bailleur ne fait ni l'un ni l'autre.
const rendre = (personnel: boolean, client: boolean) =>
  render(withIntl(<PiecesDuDossier bookingId={3} personnel={personnel} demander={personnel} deposer={client} maintenant={maintenant} />));

describe('Dossier — le dépôt du client (TCK-2879)', () => {
  beforeEach(() => {
    etat.deposer.mockReset();
  });

  it('la pièce manquante, et elle seule, se dépose : photo au téléphone, fichier au bureau', () => {
    rendre(false, true);
    expect(screen.getByRole('button', { name: `Prendre une photo : ${nom}` })).toHaveClass('md:hidden');
    expect(screen.getByRole('button', { name: `Déposer un fichier : ${nom}` })).toHaveClass('max-md:hidden');
    expect(screen.queryByRole('button', { name: /Pièce d’identité/ })).toBeNull();
    expect(document.querySelector('input[type="file"][capture="environment"]')).not.toBeNull();
  });

  it('le dépôt appelle la route de la pièce avec le fichier choisi, et dit « Pièce envoyée. »', async () => {
    etat.deposer.mockResolvedValue({ data: {} });
    rendre(false, true);
    const fichier = new File(['%PDF'], 'attestation.pdf', { type: 'application/pdf' });
    const entree = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(entree, { target: { files: [fichier] } });
    await waitFor(() => expect(etat.deposer).toHaveBeenCalledWith({ piece: 'employment_certificate', file: fichier }));
    expect(await screen.findByRole('status')).toHaveTextContent(fr.bookings.fiche.dossier.envoyee);
  });

  it('un fichier de plus de 10 Mo est refusé avant l’envoi', async () => {
    rendre(false, true);
    const entree = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    const lourd = new File(['x'], 'gros.pdf', { type: 'application/pdf' });
    Object.defineProperty(lourd, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(entree, { target: { files: [lourd] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(fr.bookings.fiche.dossier.tropLourde);
    expect(etat.deposer).not.toHaveBeenCalled();
  });

  it('une demande close (422 `booking.dossier_closed`) le dit sous la pièce', async () => {
    etat.deposer.mockImplementation(async () => {
      throw new ApiError(422, { code: 'booking.dossier_closed', message: 'closed' });
    });
    rendre(false, true);
    const entree = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(entree, { target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(fr.bookings.fiche.dossier.erreurs.closed);
  });

  it('à un autre lecteur (le bailleur), aucun dépôt', () => {
    rendre(false, false);
    expect(screen.queryByRole('button', { name: /Déposer un fichier|Prendre une photo/ })).toBeNull();
  });

  it('au personnel, aucun dépôt : « Demander » seulement', () => {
    rendre(true, false);
    expect(screen.queryByRole('button', { name: /Déposer un fichier|Prendre une photo/ })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(nom) })).toHaveTextContent(fr.bookings.fiche.dossier.demander);
  });
});
