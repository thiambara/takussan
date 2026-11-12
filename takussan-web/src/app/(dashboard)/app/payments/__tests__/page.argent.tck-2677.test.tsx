/**
 * TCK-2677 — `/app/payments` mène l'admin de l'agence active à « Argent », et lui seul.
 *
 * La page est rendue avec la VRAIE décision (`menerALArgent`) et la VRAIE traduction
 * (`adresseDeLArgent`) ; seuls le jeton, la lecture de l'agence et `redirect` sont doublés. Le
 * statut HTTP (307 et non 200 sous un repli) ne se voit pas ici : il est gardé par
 * `app/__tests__/etats-de-route.test.ts` et mesuré sur l'application (fiche du ticket).
 */
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const getMeAction = vi.fn();
const resolveAgency = vi.fn();
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
});
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => 'p' }));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/components/payments/PaymentsTabs', () => ({ PaymentsTabs: () => <div data-testid="ecran-paiements" /> }));
vi.mock('@/components/payments/CustomerPayments', () => ({ CustomerPayments: () => <div data-testid="vue-client" /> }));

import Page from '../page';

const ADMIN = { id: 1, roles: ['agency_admin', 'customer'], agency_id: 7 };

async function ouvrir(user: object, searchParams: Record<string, string | string[]> = {}) {
  getMeAction.mockResolvedValue(user);
  return Page({ searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
});

describe('TCK-2677 — l’admin de l’agence active est mené à « Argent »', () => {
  it.each([
    [{}, '/app/agency/finances?tab=encaissements'],
    [{ tab: 'history' }, '/app/agency/finances?tab=encaissements'],
    [{ tab: 'invoices' }, '/app/agency/finances?tab=factures'],
    [{ tab: 'payouts' }, '/app/agency/finances?tab=reversements'],
    [{ tab: 'approvals' }, '/app/agency/finances?tab=a-approuver'],
    [{ tab: 'bills' }, '/app/agency/finances?tab=interventions'],
  ])('%j → %s', async (params, cible) => {
    await expect(ouvrir(ADMIN, params)).rejects.toThrow(`NEXT_REDIRECT ${cible}`);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('les filtres de l’historique suivent ; `page` et l’inconnu tombent', async () => {
    await expect(
      ouvrir(ADMIN, { status: 'late', entity_type: 'lease', entity_id: '4', date_from: '2026-10-01', page: '2', x: 'y' }),
    ).rejects.toThrow('NEXT_REDIRECT /app/agency/finances?tab=encaissements&status=late&entity_type=lease&entity_id=4&date_from=2026-10-01');
  });
});

describe('TCK-2677 — tous les autres profils gardent leur écran', () => {
  it.each([
    ['l’agent (qui émet des reversements depuis ?tab=payouts)', { id: 2, roles: ['agent', 'customer'], agency_id: 7 }, 'ecran-paiements'],
    ['le bailleur', { id: 3, roles: ['owner', 'customer'], agency_id: 7 }, 'ecran-paiements'],
    ['l’admin aussi bailleur (son relevé de gérance)', { id: 4, roles: ['agency_admin', 'owner'], agency_id: 7 }, 'ecran-paiements'],
    ['le locataire', { id: 5, roles: ['tenant', 'customer'], agency_id: null }, 'vue-client'],
    ['le client', { id: 6, roles: ['customer'], agency_id: null }, 'vue-client'],
  ])('%s', async (_nom, user, ecran) => {
    render(withIntl(await ouvrir(user, { tab: 'payouts' })));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId(ecran)).toBeInTheDocument();
  });

  it('l’hôte (agence individual) garde /app/payments', async () => {
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    render(withIntl(await ouvrir(ADMIN, { tab: 'payouts' })));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId('ecran-paiements')).toBeInTheDocument();
  });

  it('une agence illisible laisse l’ancien écran, sans erreur', async () => {
    resolveAgency.mockResolvedValue(null);
    render(withIntl(await ouvrir(ADMIN)));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId('ecran-paiements')).toBeInTheDocument();
  });
});

describe('TCK-2677 — /app/payments/return ne redirige pas', () => {
  it('la page de retour ne décide rien : aucun refus, aucune lecture de l’utilisateur', () => {
    const source = readFileSync(join(__dirname, '..', 'return', 'page.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/\b(redirect|permanentRedirect|notFound|getMeAction|menerALArgent|aiguillerVersLArgent)\s*\(/);
  });

  it('aucun layout de la section ne redirige (il couvrirait /return)', () => {
    const source = readFileSync(join(__dirname, '..', 'layout.tsx'), 'utf8');
    expect(source).not.toMatch(/\bredirect\s*\(|menerALArgent|aiguillerVersLArgent/);
  });
});
