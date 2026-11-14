/**
 * TCK-2750 — « Interventions » se pagine : avec 37 factures, les 17 au-delà des 20 premières se
 * lisent (la base de démo en porte 37 pour l'agence 1, relevé du 2026-11-14).
 *
 * - L'agence : la page vit dans l'adresse (`?page=`, `?per_page=`), comme « Factures » et
 *   « Reversements » ; le compte affiché est `meta.total`, pas la longueur de la page.
 * - Le prestataire : la page vit dans `?factures_page=` — sur `/app/maintenance`, la liste des
 *   interventions lit déjà `?page=`, et les deux listes ne doivent pas tourner ensemble.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ServiceProviderBillsTable } from '../ServiceProviderBillsTable';

const { etat, PARAMS, LISTE, AUTH } = vi.hoisted(() => ({
  etat: { recherche: '', replace: (() => undefined) as (href: string) => void },
  PARAMS: [] as Array<Record<string, unknown>>,
  LISTE: { current: {} as Record<string, unknown> },
  AUTH: { user: { id: 77, agency_id: 1 } as { id: number; agency_id: number } },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
  useRouter: () => ({ replace: (href: string, _options?: unknown) => etat.replace(href), push: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/payments', () => ({
  useServiceProviderBills: (params: Record<string, unknown>) => {
    PARAMS.push(params);
    return LISTE.current;
  },
  useValidateServiceProviderBill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectServiceProviderBill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePayServiceProviderBill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function facture(id: number) {
  return {
    id,
    maintenance_request_id: id,
    agency_id: 1,
    property_id: 1,
    provider_id: 77,
    reference_number: `SPB-${id}`,
    provider_reference: null,
    amount: 10000,
    currency: 'XOF',
    exceeds_quote: false,
    status: 'paid',
    validated_at: null,
    rejection_reason: null,
    rechargeable_to_landlord: false,
    imputed_payout_id: null,
    created_at: '2026-10-01T10:00:00Z',
  };
}

/** La page `page` d'un registre de 37 factures, à 20 par page. */
function page37(page: number) {
  const debut = (page - 1) * 20 + 1;
  const fin = Math.min(37, page * 20);
  const data = Array.from({ length: fin - debut + 1 }, (_, i) => facture(debut + i));
  LISTE.current = {
    isLoading: false,
    isError: false,
    error: null,
    data: { data, meta: { current_page: page, last_page: 2, per_page: 20, total: 37 } },
  };
}

const replace = vi.fn<(href: string) => void>();

beforeEach(() => {
  PARAMS.length = 0;
  replace.mockReset();
  etat.recherche = '';
  etat.replace = replace;
  AUTH.user = { id: 77, agency_id: 1 };
  page37(1);
});

describe('TCK-2750 — l’agence : la page dans l’adresse', () => {
  it('AC1/AC2 — page 1 : 20 lignes, le compte est meta.total (37), « Suivant » écrit ?page=2 sans perdre l’onglet', () => {
    etat.recherche = 'tab=interventions';
    render(withIntl(<ServiceProviderBillsTable mode="agency" titreMasque />));

    expect(PARAMS.at(-1)).toEqual({ agency_id: 1, page: 1, per_page: 20 });
    expect(screen.getAllByText(/^SPB-\d+$/)).toHaveLength(20);
    expect(screen.getByText(/37 résultats/)).toBeInTheDocument();
    expect(screen.queryByText(/20 résultats/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(replace).toHaveBeenCalledWith('?tab=interventions&page=2');
  });

  it('AC1 — ?page=2 demande la page 2 au serveur, et les 17 dernières factures se lisent', () => {
    etat.recherche = 'tab=interventions&page=2';
    page37(2);
    render(withIntl(<ServiceProviderBillsTable mode="agency" />));

    expect(PARAMS.at(-1)).toEqual({ agency_id: 1, page: 2, per_page: 20 });
    expect(screen.getAllByText(/^SPB-\d+$/)).toHaveLength(17);
    expect(screen.getByText('SPB-37')).toBeInTheDocument();
    expect(screen.getByText('Page 2 sur 2 · 37 résultats')).toBeInTheDocument();
  });

  it('la densité de l’adresse est honorée (10, 20, 50), toute autre valeur retombe à 20', () => {
    etat.recherche = 'per_page=50';
    const { unmount } = render(withIntl(<ServiceProviderBillsTable mode="agency" />));
    expect(PARAMS.at(-1)).toMatchObject({ per_page: 50 });
    unmount();

    etat.recherche = 'per_page=5000&page=-3';
    render(withIntl(<ServiceProviderBillsTable mode="agency" />));
    expect(PARAMS.at(-1)).toMatchObject({ page: 1, per_page: 20 });
  });
});

describe('TCK-2750 — le prestataire : la page dans ?factures_page=, jamais dans ?page=', () => {
  it('ignore le ?page= de la liste voisine, et « Suivant » écrit ?factures_page=2 en la gardant', () => {
    etat.recherche = 'status=open&page=4';
    render(withIntl(<ServiceProviderBillsTable mode="provider" />));

    expect(PARAMS.at(-1)).toEqual({ provider_id: 77, page: 1, per_page: 20 });
    expect(screen.getByText('Page 1 sur 2 · 37 résultats')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(replace).toHaveBeenCalledWith('?status=open&page=4&factures_page=2');
  });

  it('?factures_page=2 demande la page 2 — elle survit au rechargement et au retour arrière', () => {
    etat.recherche = 'page=4&factures_page=2';
    page37(2);
    render(withIntl(<ServiceProviderBillsTable mode="provider" />));

    expect(PARAMS.at(-1)).toEqual({ provider_id: 77, page: 2, per_page: 20 });
    expect(screen.getByText('SPB-37')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(replace).toHaveBeenCalledWith('?page=4');
  });
});
