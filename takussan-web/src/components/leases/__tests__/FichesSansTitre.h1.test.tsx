/**
 * TCK-1189 (P101.02) — les écrans de chargement et d'erreur des fiches bail et document gardent
 * un `h1`, comme `BookingDetail` et `VisitDetail` : la page autour n'en rend aucun, et axe y
 * rendait `page-has-heading-one` (mesuré sur `/app/documents/1`).
 *
 * Le titre réutilise des clés existantes : `lease.fallbackReference` (« Bail #{id} ») et
 * `dashboard.pages.documentDetail.metaTitle` (« Fiche document »).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const { etat, requete, mutation } = vi.hoisted(() => {
  const etat = { isLoading: false, isError: false };
  return {
    etat,
    requete: () => ({
      data: undefined,
      isLoading: etat.isLoading,
      isError: etat.isError,
      refetch: () => undefined,
    }),
    mutation: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }),
  };
});

vi.mock('@/lib/queries/leases', () => ({
  useLease: requete,
  useLeasePayments: () => ({ data: { data: [] } }),
  useGenerateSchedule: mutation,
  useActivateLease: mutation,
  useReviewLeaseRent: mutation,
  useCancelEarlyTermination: mutation,
  useRequestLeaseSignature: mutation,
  useSendLeaseSignatureCode: mutation,
  useSignLease: mutation,
}));

vi.mock('@/lib/queries/documents', () => ({
  useDocumentWithVersions: requete,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

import { LeaseDetail } from '../LeaseDetail';
import { DocumentDetailClient } from '@/components/documents/DocumentDetailClient';

const ETATS = [
  { nom: 'chargement', isLoading: true, isError: false },
  { nom: 'erreur', isLoading: false, isError: true },
] as const;

describe('fiches bail et document — un h1 hors du rendu nominal (TCK-1189, P101.02)', () => {
  beforeEach(() => {
    etat.isLoading = false;
    etat.isError = false;
  });

  for (const cas of ETATS) {
    it(`bail en ${cas.nom} : un h1 « Bail #42 »`, () => {
      etat.isLoading = cas.isLoading;
      etat.isError = cas.isError;
      render(withIntl(<LeaseDetail leaseId={42} />));

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bail #42');
    });

    it(`document en ${cas.nom} : un h1 « Fiche document »`, () => {
      etat.isLoading = cas.isLoading;
      etat.isError = cas.isError;
      render(withIntl(<DocumentDetailClient documentId={7} />));

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fiche document');
    });
  }
});
