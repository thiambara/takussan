/**
 * TCK-2656 (lot 3) — « Versions (n) » de la fiche, qui remplace l'accordéon `DocumentVersionsList` :
 * l'actuelle, le commentaire, « Vous » pour ses propres versions, « Restaurer » et « Ajouter une
 * version » au seul verdict reçu, l'échéance du nouveau fichier envoyée — et les rejets de l'API
 * rattrapés, boîte ouverte (P210.04, TCK-2086, porté de `DocumentVersionsList.rejet-rattrape`).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

const envoi = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }));
const restauration = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, error: null }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 } }) }));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id: string; value: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
vi.mock('@/lib/queries/documents', () => ({
  DOCUMENT_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  DOCUMENT_MIME_ACCEPT: 'application/pdf',
  useDocumentVersions: () => ({
    data: {
      data: [
        { id: 2, version_number: 2, file_name: 'cni-v2.jpg', is_active: true, created_at: '2026-06-28T10:00:00Z', size: 2048, comment: 'Recto et verso sur la même photo', url: 'https://media.test/v2', uploaded_by_id: 11, mime_type: 'image/jpeg' },
        { id: 1, version_number: 1, file_name: 'cni-v1.jpg', is_active: false, created_at: '2026-06-27T10:00:00Z', size: 1024, comment: null, url: null, uploaded_by_id: 40, mime_type: 'image/jpeg' },
      ],
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useUploadDocumentVersion: () => envoi,
  useRestoreDocumentVersion: () => restauration,
}));

import { VersionsDuDocument } from '../VersionsDuDocument';

const V = fr.documents.versions;
const rejets: unknown[] = [];
const surRejet = (raison: unknown) => {
  rejets.push(raison);
};

beforeEach(() => {
  rejets.length = 0;
  process.on('unhandledRejection', surRejet);
  envoi.mutateAsync.mockReset().mockResolvedValue({ data: {} });
  restauration.mutateAsync.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => {
  process.off('unhandledRejection', surRejet);
});

describe('TCK-2656 — les versions de la fiche', () => {
  it('liste l’actuelle, le commentaire, « Vous » pour sa propre version et la date seule sinon', () => {
    render(withIntl(<VersionsDuDocument documentId={5} peutAjouter peutRestaurer />));
    expect(screen.getByRole('heading', { name: 'Versions (2)' })).toBeInTheDocument();
    const [v2, v1] = screen.getAllByRole('listitem');
    expect(v2).toHaveTextContent('Version 2');
    expect(v2).toHaveTextContent('Actuelle');
    expect(v2).toHaveTextContent('« Recto et verso sur la même photo »');
    expect(v2).toHaveTextContent(/^.*Vous · 28 juin 2026/);
    expect(within(v2).queryByRole('button', { name: 'Restaurer la version 2' })).not.toBeInTheDocument();
    expect(v1).not.toHaveTextContent('Vous');
    expect(v1).toHaveTextContent('27 juin 2026');
    expect(within(v1).getByRole('button', { name: 'Restaurer la version 1' })).toBeInTheDocument();
    expect(within(v2).getByRole('link', { name: 'Télécharger la version 2' })).toHaveAttribute('href', 'https://media.test/v2');
  });

  it('sans droit, ni « Ajouter une version » ni « Restaurer »', () => {
    render(withIntl(<VersionsDuDocument documentId={5} peutAjouter={false} peutRestaurer={false} />));
    expect(screen.queryByRole('button', { name: 'Ajouter une version' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restaurer/ })).not.toBeInTheDocument();
  });

  it('« Expire le » reprend l’échéance actuelle : sans y toucher, elle repart (l’API la viderait sinon)', async () => {
    const user = userEvent.setup();
    render(withIntl(<VersionsDuDocument documentId={5} peutAjouter peutRestaurer echeanceActuelle="2026-12-22" />));
    await user.click(screen.getByRole('button', { name: 'Ajouter une version' }));
    expect(screen.getByLabelText(/Expire le/)).toHaveValue('2026-12-22');
    const fichier = new File(['%PDF'], 'cni-v3.pdf', { type: 'application/pdf' });
    await user.upload(document.getElementById('version-upload-input') as HTMLInputElement, fichier);
    await user.click(screen.getByRole('button', { name: V.submit }));
    await waitFor(() => expect(envoi.mutateAsync).toHaveBeenCalledWith({ document_id: 5, file: fichier, comment: undefined, expiry_date: '2026-12-22' }));
  });

  it('la nouvelle version part avec son commentaire et l’échéance du nouveau fichier', async () => {
    const user = userEvent.setup();
    render(withIntl(<VersionsDuDocument documentId={5} peutAjouter peutRestaurer echeanceActuelle="2026-12-22" />));
    await user.click(screen.getByRole('button', { name: 'Ajouter une version' }));
    const fichier = new File(['%PDF'], 'cni-v3.pdf', { type: 'application/pdf' });
    await user.upload(document.getElementById('version-upload-input') as HTMLInputElement, fichier);
    await user.type(screen.getByLabelText(/Commentaire/), 'Carte renouvelée');
    await user.clear(screen.getByLabelText(/Expire le/));
    await user.type(screen.getByLabelText(/Expire le/), '2036-11-09');
    await user.click(screen.getByRole('button', { name: V.submit }));

    await waitFor(() =>
      expect(envoi.mutateAsync).toHaveBeenCalledWith({ document_id: 5, file: fichier, comment: 'Carte renouvelée', expiry_date: '2036-11-09' }),
    );
  });

  it('un ajout de version refusé n’échappe pas au gestionnaire, et la boîte reste ouverte (P210.04)', async () => {
    envoi.mutateAsync.mockRejectedValue(new ApiError(422, { message: 'Fichier refusé' }));
    const user = userEvent.setup();
    render(withIntl(<VersionsDuDocument documentId={5} peutAjouter peutRestaurer />));
    await user.click(screen.getByRole('button', { name: 'Ajouter une version' }));
    await user.upload(document.getElementById('version-upload-input') as HTMLInputElement, new File(['%PDF'], 'v3.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: V.submit }));

    await waitFor(() => expect(envoi.mutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(rejets).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('une restauration refusée n’échappe pas au gestionnaire, et la boîte reste ouverte (P210.04)', async () => {
    restauration.mutateAsync.mockRejectedValue(new ApiError(422, { message: 'Déjà active' }));
    const user = userEvent.setup();
    render(withIntl(<VersionsDuDocument documentId={5} peutAjouter peutRestaurer />));
    await user.click(screen.getByRole('button', { name: 'Restaurer la version 1' }));
    await user.click(screen.getByRole('button', { name: fr.common.actions.confirm }));

    await waitFor(() => expect(restauration.mutateAsync).toHaveBeenCalledWith({ document_id: 5, version_id: 1 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(rejets).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
