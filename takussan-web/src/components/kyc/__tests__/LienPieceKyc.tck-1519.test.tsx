import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { KycDecisionPanel } from '@/components/admin/super/kyc-queue';
import { KycDocumentUploader } from '../kyc-components';
import { lienPieceKyc } from '@/lib/lien-piece-kyc';
import type { KycDocument, KycDossier } from '@/types/super-admin';

/**
 * TCK-1519 (P73.03, TCK-546) — un lien de pièce KYC est une navigation : elle ne porte aucun
 * Bearer, et `kyc.documents.show` reste sous `auth:sanctum`. Le lien vise donc le relais du front
 * (`/api/kyc/documents/[media]`, même origine, jeton du cookie), signature comprise, et jamais
 * l'hôte de l'API.
 */

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const SIGNEE = 'https://api.test/api/kyc/documents/42?expires=1700000000&signature=abc';
const RELAIS = '/api/kyc/documents/42?expires=1700000000&signature=abc';

function piece(type: string): KycDocument {
  return {
    id: 42,
    file_name: `${type}.pdf`,
    mime_type: 'application/pdf',
    size: 1000,
    document_type: type,
    signed_url: SIGNEE,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    document_expires_at: null,
  };
}

function dossier(): KycDossier {
  return {
    id: 5,
    subject_type: 'Agency',
    subject_id: 12,
    subject: { id: 12, type: 'Agency', name: 'Dakar Immo', slug: 'dakar-immo' },
    status: 'submitted',
    submitted_at: '2026-10-01T10:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    metadata: {},
    documents: [piece('rccm')],
    expires_at: null,
    created_at: '2026-09-30T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  };
}

function monter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

describe('lienPieceKyc', () => {
  it('garde le chemin et la signature, sur l\'origine du front', () => {
    expect(lienPieceKyc(SIGNEE)).toBe(RELAIS);
  });

  it('rend tel quel un lien qui ne vise pas une pièce KYC', () => {
    expect(lienPieceKyc('https://api.test/api/media/1/file?signature=x')).toBe('https://api.test/api/media/1/file?signature=x');
    expect(lienPieceKyc('pas une url')).toBe('pas une url');
  });
});

describe('les liens de pièce KYC visent le relais du front', () => {
  it('console d\'agence', () => {
    monter(<KycDocumentUploader agencyId={12} dossier={dossier()} />);
    expect(screen.getByRole('link', { name: /rccm\.pdf/ })).toHaveAttribute('href', RELAIS);
  });

  it('file du super-admin', () => {
    monter(<KycDecisionPanel dossier={dossier()} onDone={() => {}} />);
    const liens = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/kyc/documents/'));
    expect(liens.length).toBeGreaterThan(0);
    for (const lien of liens) expect(lien).toHaveAttribute('href', RELAIS);
  });
});
