/**
 * TCK-700 (P13.04) — le dialogue de dépôt prévient son appelant d'un dépôt réussi.
 *
 * L'onglet Documents de la fiche client dépose désormais par ce dialogue (via
 * `AddDocumentButton`) ; sa liste vient du rendu serveur de la fiche et ne se met à jour que si
 * l'appelant rafraîchit la page. `onUploaded` est ce signal. Le test passe aussi par le vrai
 * formulaire : la fiche ciblée part bien en `documentable_type=customer`.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { DocumentUploadDialog } from '../DocumentUploadDialog';

const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 1 } });
vi.mock('@/lib/queries/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/documents')>()),
  useUploadDocument: () => ({ mutateAsync }),
}));

describe('<DocumentUploadDialog> — onUploaded (TCK-700)', () => {
  it('appelle onUploaded après un dépôt réussi pour la fiche client', async () => {
    const onUploaded = vi.fn();
    render(
      withIntl(
        <DocumentUploadDialog
          open
          onOpenChange={vi.fn()}
          defaultDocumentable={{ type: 'customer', id: 42 }}
          onUploaded={onUploaded}
        />,
      ),
    );

    const fichier = new File(['%PDF'], 'piece.pdf', { type: 'application/pdf' });
    fireEvent.change(document.getElementById('document-upload-input')!, {
      target: { files: [fichier] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Téléverser' }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        file: fichier,
        name: 'piece',
        documentable_type: 'customer',
        documentable_id: 42,
      }),
    );
  });
});
