import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { KYC_MIME_ACCEPT } from '../KycUploader';
import { KycDocumentUploader } from '../kyc-components';
import type { KycDossier } from '@/types/super-admin';

/**
 * TCK-2150 (P222.06) — la pièce KYC d'agence (`UploadKycDocumentRequest`,
 * `AcceptedUploads::kyc(10240)`) partait sans contrôle de taille, et le sélecteur grisait la photo
 * d'iPhone (HEIC, HEIF) que l'API admet.
 */
const upload = vi.fn();
vi.mock('@/lib/queries/kyc', () => ({
  uploadAgencyKycDocument: (...args: unknown[]) => upload(...args),
  submitAgencyKyc: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const dossier: KycDossier = {
  id: 5,
  subject_type: 'Agency',
  subject_id: 12,
  subject: { id: 12, type: 'Agency', name: 'Dakar Immo', slug: 'dakar-immo' },
  status: 'pending',
  submitted_at: null,
  reviewed_at: null,
  reviewed_by: null,
  rejection_reason: null,
  metadata: {},
  documents: [],
  expires_at: null,
  created_at: '2026-09-30T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <KycDocumentUploader agencyId={12} dossier={dossier} />
    </QueryClientProvider>,
  ));
  return document.getElementById('kyc-file-rccm') as HTMLInputElement;
}

function fichier(nom: string, octets: number): File {
  const f = new File(['%PDF'], nom, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: octets });
  return f;
}

describe('<KycDocumentUploader> — taille et types au choix', () => {
  it('une pièce de 11 Mo est refusée au choix, nommée, et ne part pas', () => {
    const input = monter();
    fireEvent.change(input, { target: { files: [fichier('rccm-scan.pdf', 11 * 1024 * 1024)] } });

    expect(screen.getByRole('alert')).toHaveTextContent('Fichier trop lourd (10 Mo au plus) : rccm-scan.pdf');
    // Aucun fichier retenu : le bouton « Ajouter » de la ligne reste inactif.
    for (const bouton of screen.getAllByRole('button', { name: /Ajouter/ })) expect(bouton).toBeDisabled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('une pièce de 10 Mo exactement est retenue, sans alerte', () => {
    const input = monter();
    fireEvent.change(input, { target: { files: [fichier('rccm.pdf', 10 * 1024 * 1024)] } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('rccm.pdf')).toBeInTheDocument();
  });

  it('le sélecteur propose ce que l’API admet, HEIC et HEIF compris', () => {
    const input = monter();
    expect(input.getAttribute('accept')).toBe(KYC_MIME_ACCEPT);
  });
});
