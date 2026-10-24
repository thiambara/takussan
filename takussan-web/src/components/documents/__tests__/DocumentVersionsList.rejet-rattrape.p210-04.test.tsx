/**
 * P210.04 (TCK-2086) — l'ajout et la restauration d'une version refusés par l'API montrent déjà
 * l'erreur lue sur la mutation ; le rejet de `mutateAsync`, lui, ne doit pas sortir non rattrapé
 * de `void handleSubmit(e)` ni de `void handleConfirm()`, et le dialogue reste ouvert.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { DocumentVersionsList } from '../DocumentVersionsList';

const upload = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, error: null }));
const restore = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, error: null }));

vi.mock('@/lib/queries/documents', () => ({
  DOCUMENT_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  DOCUMENT_MIME_ACCEPT: 'application/pdf',
  useDocumentVersions: () => ({
    data: {
      data: [
        { id: 2, version_number: 2, file_name: 'bail-v2.pdf', is_active: true, created_at: null, size: 2048, comment: null, url: null },
        { id: 1, version_number: 1, file_name: 'bail-v1.pdf', is_active: false, created_at: null, size: 1024, comment: null, url: null },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUploadDocumentVersion: () => upload,
  useRestoreDocumentVersion: () => restore,
}));

const V = fr.documents.versions;

const rejets: unknown[] = [];
const surRejet = (raison: unknown) => {
  rejets.push(raison);
};

describe('<DocumentVersionsList> — rejets rattrapés (P210.04)', () => {
  beforeEach(() => {
    rejets.length = 0;
    process.on('unhandledRejection', surRejet);
    upload.mutateAsync.mockReset().mockRejectedValue(new ApiError(422, { message: 'Fichier refusé' }));
    restore.mutateAsync.mockReset().mockRejectedValue(new ApiError(422, { message: 'Déjà active' }));
  });
  afterEach(() => {
    process.off('unhandledRejection', surRejet);
  });

  it('un ajout de version refusé n’échappe pas au gestionnaire, et le dialogue reste ouvert', async () => {
    const user = userEvent.setup();
    render(withIntl(<DocumentVersionsList documentId={5} canManage defaultOpen />));

    await user.click(screen.getByRole('button', { name: V.add_title }));
    const fichier = new File(['%PDF'], 'bail-v3.pdf', { type: 'application/pdf' });
    await user.upload(document.getElementById('version-upload-input') as HTMLInputElement, fichier);
    await user.click(screen.getByRole('button', { name: V.submit }));

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(rejets).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('une restauration refusée n’échappe pas au gestionnaire, et le dialogue reste ouvert', async () => {
    const user = userEvent.setup();
    render(withIntl(<DocumentVersionsList documentId={5} canManage defaultOpen />));

    await user.click(screen.getByRole('button', { name: V.restore_aria.replace('{version}', '1') }));
    await user.click(screen.getByRole('button', { name: fr.common.actions.confirm }));

    await waitFor(() => expect(restore.mutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(rejets).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
