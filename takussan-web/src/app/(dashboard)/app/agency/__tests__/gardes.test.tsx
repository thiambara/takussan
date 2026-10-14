import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGES_ADMIN } from '@/lib/access/pages-admin';

/**
 * TCK-633 (lot B, AC1) — CHAQUE page d'administration appelle `garderPageAdmin(<son chemin>)`, et
 * l'appelle EN PREMIER : avant de lire l'utilisateur, avant toute donnée. TCK-649 — ces pages vivent
 * sous `/app/agency/*` (ADR-0064 §1).
 *
 * La garde est remplacée par une sonde qui LÈVE : si la page la passe, la page continue, lit
 * `getMeAction` — remplacé par une sonde qui lève aussi, avec un autre message. Le test distingue
 * donc « gardée en premier », « gardée trop tard » et « pas gardée ». Les composants et actions des
 * pages ne sont qu'importés (la garde lève avant eux) : ils sont remplacés par des souches.
 */
const { garde, getMe } = vi.hoisted(() => ({
  garde: vi.fn(async (chemin: string) => {
    throw new Error(`GARDE:${chemin}`);
  }),
  getMe: vi.fn(async () => {
    throw new Error('getMeAction appelé AVANT la garde');
  }),
}));

vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: (c: string) => garde(c) }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn(), permanentRedirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: async () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));
vi.mock('@/components/shared/NoAgencyState', () => ({ NoAgencyState: () => null }));
vi.mock('@/app/actions/admin-agency', () => ({ fetchAgencyAction: async () => ({ ok: false, message: '' }) }));
vi.mock('@/components/admin-agency/AgencyConfigForm', () => ({ AgencyConfigForm: () => null }));
vi.mock('@/components/admin-agency/RegenerateWatermarksCard', () => ({ RegenerateWatermarksCard: () => null }));
vi.mock('@/components/feedback', () => ({ EmptyState: () => null, ErrorState: () => null }));
vi.mock('@/components/kyc/AgencyKycClient', () => ({ AgencyKycClient: () => null }));
vi.mock('@/components/billing/AgencyBillingClient', () => ({ AgencyBillingClient: () => null }));
vi.mock('@/components/billing/AgencyPayoutsClient', () => ({ AgencyPayoutsClient: () => null }));
vi.mock('@/components/admin/AuditTrail', () => ({ AuditTrail: () => null }));
vi.mock('@/app/(dashboard)/app/agency/finances/AdminFinancesClient', () => ({ AdminFinancesClient: () => null }));
vi.mock('@/components/admin/reconciliation/ReconciliationClient', () => ({ ReconciliationClient: () => null }));
vi.mock('@/components/admin/reconciliation/StatementDetail', () => ({ StatementDetail: () => null }));
vi.mock('@/components/admin/ModerationWorkspace', () => ({ ModerationWorkspace: () => null }));
vi.mock('@/components/admin/PropertyModerationWorkspace', () => ({ PropertyModerationWorkspace: () => null }));
vi.mock('@/components/admin/roles/AgencyRolesConsole', () => ({ AgencyRolesConsole: () => null }));
vi.mock('@/components/admin/roles/RoleDelegationsSection', () => ({ RoleDelegationsSection: () => null }));
vi.mock('@/components/admin/TeamConsole', () => ({ TeamConsole: () => null }));
vi.mock('@/components/admin/InviteMemberButton', () => ({ InviteMemberButton: () => null }));
vi.mock('@/app/actions/admin-settings', () => ({
  fetchIntegrationsAction: async () => ({ ok: false, message: '' }),
  fetchPaymentProviderSchemasAction: async () => ({ ok: false, message: '' }),
  fetchIntegrationWebhookEndpointAction: async () => ({ ok: false, message: '' }),
}));
vi.mock('@/components/admin-settings/IntegrationsManager', () => ({ IntegrationsManager: () => null }));

type PageServeur = (props: never) => Promise<unknown>;

/** [chemin gardé, fichier, chargement, props] — une ligne par `page.tsx` qui n'est pas une souche. */
const CAS: ReadonlyArray<readonly [string, string, () => Promise<{ default: unknown }>, unknown]> = [
  ['/app/agency/team', 'team/page.tsx', () => import('../team/page'), undefined],
  ['/app/agency/roles', 'roles/page.tsx', () => import('../roles/page'), undefined],
  ['/app/agency', 'page.tsx', () => import('../page'), undefined],
  ['/app/agency/kyc', 'kyc/page.tsx', () => import('../kyc/page'), undefined],
  ['/app/agency/billing', 'billing/page.tsx', () => import('../billing/page'), undefined],
  ['/app/agency/finances', 'finances/page.tsx', () => import('../finances/page'), undefined],
  [
    '/app/agency/finances/reconciliation',
    'finances/reconciliation/page.tsx',
    () => import('../finances/reconciliation/page'),
    undefined,
  ],
  [
    '/app/agency/finances/reconciliation',
    'finances/reconciliation/[statementId]/page.tsx',
    () => import('../finances/reconciliation/[statementId]/page'),
    { params: Promise.resolve({ statementId: '3' }) },
  ],
  ['/app/agency/moderation', 'moderation/page.tsx', () => import('../moderation/page'), undefined],
  [
    '/app/agency/moderation/properties',
    'moderation/properties/page.tsx',
    () => import('../moderation/properties/page'),
    undefined,
  ],
  ['/app/agency/audit', 'audit/page.tsx', () => import('../audit/page'), undefined],
  ['/app/agency/integrations', 'integrations/page.tsx', () => import('../integrations/page'), undefined],
];

describe('TCK-633 / TCK-649 — chaque page /app/agency/* appelle garderPageAdmin EN PREMIER', () => {
  beforeEach(() => {
    garde.mockClear();
    getMe.mockClear();
  });

  it.each(CAS)('%s (%s)', async (chemin, _fichier, charger, props) => {
    const { default: Page } = await charger();
    await expect((Page as PageServeur)(props as never)).rejects.toThrow(`GARDE:${chemin}`);
    expect(garde).toHaveBeenCalledTimes(1);
    expect(garde).toHaveBeenCalledWith(chemin);
    expect(getMe).not.toHaveBeenCalled();
  });

  it('chaque chemin de PAGES_ADMIN a sa page dans ce tableau', () => {
    expect(new Set(CAS.map(([chemin]) => chemin))).toEqual(new Set(PAGES_ADMIN.map((p) => p.chemin)));
  });
});
