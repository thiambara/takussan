/**
 * TCK-1024 (P63.03) — une requête qui porte une URL signée se rafraîchit avant que le lien expire.
 *
 * L'API émet les pièces KYC pour 15 min (`KycDossierResource`) et les médias privés pour 30 min
 * (`PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES`). Le client par défaut ne refetche qu'au montage,
 * au retour du focus ou à la reconnexion (`query-client.ts`) : un onglet resté au premier plan
 * gardait des liens morts, et le clic ouvrait la réponse JSON du refus de signature.
 *
 * Ce que ces tests refusent : une requête des écrans KYC, documents ou maintenance qui porte une
 * URL signée sans `refetchInterval` plus court que la durée du lien — et, pour la file KYC, un
 * panneau qui afficherait encore le lien de l'instantané sélectionné après le rafraîchissement.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { avecGestes } from '@/test/habilitations';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/',
}));

const { DUREE_URL_SIGNEE_KYC_MS, DUREE_URL_SIGNEE_MEDIA_MS } = await import('@/lib/url-signee');
const { useDocuments, useDocumentVersions } = await import('@/lib/queries/documents');
const { useMaintenanceRequest } = await import('@/lib/queries/maintenance');
const { AgencyKycClient } = await import('@/components/kyc/AgencyKycClient');
const { AgencyDetailPage } = await import('@/components/admin/super/agency-detail');
const { default: SuperAdminKycPage } = await import('@/app/(super-admin)/super-admin/kyc/page');

function nouveauClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Les options effectives des observateurs montés sur la clé : c'est elles que TanStack applique. */
function optionsObservees(client: QueryClient, queryKey: readonly unknown[]) {
  const query = client.getQueryCache().find({ queryKey: [...queryKey], exact: true });
  expect(query, `aucune requête sous ${JSON.stringify(queryKey)}`).toBeDefined();
  expect(query!.observers.length).toBeGreaterThan(0);
  return query!.observers.map((o) => o.options);
}

/** Chaque observateur rafraîchit avant l'échéance, et tient la donnée pour périmée avant elle. */
function attendRafraichissementAvant(client: QueryClient, queryKey: readonly unknown[], dureeMs: number) {
  for (const options of optionsObservees(client, queryKey)) {
    expect(typeof options.refetchInterval).toBe('number');
    expect(options.refetchInterval as number).toBeGreaterThan(0);
    expect(options.refetchInterval as number).toBeLessThan(dureeMs);
    expect(typeof options.staleTime).toBe('number');
    expect(options.staleTime as number).toBeLessThan(dureeMs);
  }
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('les durées recopient celles de l’API', () => {
  it('15 min pour une pièce KYC, 30 min pour un média privé', () => {
    expect(DUREE_URL_SIGNEE_KYC_MS).toBe(15 * 60 * 1000);
    expect(DUREE_URL_SIGNEE_MEDIA_MS).toBe(30 * 60 * 1000);
  });
});

describe('documents et maintenance — `file_url` et `url` signés pour 30 min', () => {
  function monter<T>(hook: () => T) {
    const client = nouveauClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    renderHook(hook, { wrapper });
    return client;
  }

  it('la bibliothèque de documents (`useDocuments`)', () => {
    const client = monter(() => useDocuments({ page: 1 }));
    attendRafraichissementAvant(client, ['documents', 'list', { page: 1 }], DUREE_URL_SIGNEE_MEDIA_MS);
  });

  it('les versions d’un document (`useDocumentVersions`)', () => {
    const client = monter(() => useDocumentVersions(7));
    attendRafraichissementAvant(client, ['documents', 'versions', 7], DUREE_URL_SIGNEE_MEDIA_MS);
  });

  it('le détail d’une demande de maintenance et sa galerie (`useMaintenanceRequest`)', () => {
    const client = monter(() => useMaintenanceRequest(9));
    const cle = client.getQueryCache().getAll()[0]!.queryKey;
    attendRafraichissementAvant(client, cle, DUREE_URL_SIGNEE_MEDIA_MS);
  });
});

describe('KYC — `signed_url` signé pour 15 min', () => {
  it('l’écran KYC de l’agence (`AgencyKycClient`)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const client = nouveauClient();
    render(withIntl(<QueryClientProvider client={client}><AgencyKycClient agencyId={12} /></QueryClientProvider>));
    attendRafraichissementAvant(client, ['agency', 12, 'kyc'], DUREE_URL_SIGNEE_KYC_MS);
  });

  it('l’onglet KYC de la fiche agence du super-admin', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const client = nouveauClient();
    render(withIntl(<QueryClientProvider client={client}>{avecGestes(<AgencyDetailPage agencyId={12} />)}</QueryClientProvider>));
    attendRafraichissementAvant(client, ['super-admin', 'agency', 12, 'kyc'], DUREE_URL_SIGNEE_KYC_MS);
  });

  describe('la file KYC du super-admin', () => {
    function dossier(signedUrl: string) {
      return {
        id: 41,
        subject_type: 'Agency',
        subject_id: 12,
        subject: { id: 12, type: 'Agency', name: 'Dakar Immo Sarl', slug: 'dakar-immo' },
        status: 'submitted',
        submitted_at: '2026-08-20T09:00:00+00:00',
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
        metadata: {},
        documents: [
          { id: 1, file_name: 'rccm.pdf', mime_type: 'application/pdf', size: 10, document_type: 'rccm', signed_url: signedUrl, expires_at: '2026-08-27T10:00:00+00:00' },
        ],
        created_at: '2026-08-19T09:00:00+00:00',
        updated_at: '2026-08-20T09:00:00+00:00',
      };
    }

    function servir(lien: () => string) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({ data: [dossier(lien())], meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 } }),
        })),
      );
    }

    function monterFile() {
      const client = nouveauClient();
      render(withIntl(<QueryClientProvider client={client}><SuperAdminKycPage /></QueryClientProvider>));
      return client;
    }

    it('la file se rafraîchit avant l’échéance des liens', async () => {
      servir(() => 'https://x.test/1?signature=a');
      const client = monterFile();
      await screen.findByText('Dakar Immo Sarl');
      const cle = client.getQueryCache().findAll({ queryKey: ['super-admin', 'kyc', 'queue'] })[0]!.queryKey;
      for (const options of optionsObservees(client, cle)) {
        expect(typeof options.refetchInterval).toBe('number');
        expect(options.refetchInterval as number).toBeLessThan(DUREE_URL_SIGNEE_KYC_MS);
      }
    });

    it('le panneau du dossier sélectionné suit le rafraîchissement, pas l’instantané du clic', async () => {
      let lien = 'https://x.test/1?signature=ancienne';
      servir(() => lien);
      const client = monterFile();
      await userEvent.click(await screen.findByRole('button', { name: 'Instruire' }));
      const panneau = () => screen.getByRole('link', { name: 'Ouvrir' });
      await waitFor(() => expect(panneau()).toHaveAttribute('href', 'https://x.test/1?signature=ancienne'));

      lien = 'https://x.test/1?signature=neuve';
      await client.refetchQueries({ queryKey: ['super-admin', 'kyc', 'queue'] });
      await waitFor(() => expect(panneau()).toHaveAttribute('href', 'https://x.test/1?signature=neuve'));
    });
  });
});
