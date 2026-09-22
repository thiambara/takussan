import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TCK-542 — QUI réduit, et qui ne réduit pas.
 *
 * Trois écrans ont un test de comportement (assistant, gestionnaire de médias, avatar). Les autres
 * n'ont pas de fichier de test où l'envoi se voie ; cette garde tient leur branchement : chaque
 * écran de PHOTOS importe la réduction ET l'appelle. Et dans l'autre sens, aucune pièce
 * justificative (KYC, documents, devis, justificatifs) ne la touche : elles partent telles qu'elles
 * ont été produites, même quand ce sont des images.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (chemin: string) => readFileSync(join(SRC, chemin), 'utf8');

const ECRANS_DE_PHOTOS = [
  'components/property-form/PropertyWizard.tsx',
  'components/media/MediaManager.tsx',
  'components/profile/ProfileHeader.tsx',
  'components/admin-agency/AgencyConfigForm.tsx',
  'components/maintenance/MaintenanceForm.tsx',
  'components/maintenance/MaintenanceCompleteForm.tsx',
  'components/messages/ChatView.tsx',
] as const;

const PIECES_JUSTIFICATIVES = [
  'components/kyc/KycUploader.tsx',
  'components/documents/DocumentUploadDialog.tsx',
  'components/maintenance/QuoteSubmitForm.tsx',
  'components/leases/DepositRefundModal.tsx',
] as const;

describe('réduction des photos — branchement', () => {
  it.each(ECRANS_DE_PHOTOS)('%s importe la réduction et l’appelle', (chemin) => {
    const source = lire(chemin);
    expect(source).toMatch(/from '@\/lib\/reduire-photo'/);
    expect(source).toMatch(/await reduirePhotos?\(/);
  });

  it.each(PIECES_JUSTIFICATIVES)('%s ne réduit RIEN : une pièce part telle quelle', (chemin) => {
    expect(lire(chemin)).not.toMatch(/reduire-photo/);
  });
});
