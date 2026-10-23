/**
 * P152.03 — `/app/properties/new` se juge comme `PropertyPolicy::create` et `createsProposal` :
 * « Publier » sous `properties.create`, « Proposer » pour le bailleur sans elle, et rien sans l'un
 * ni l'autre (le layout du segment renvoie vers la liste des biens).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';

const mockGetMe = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

vi.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url) }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: vi.fn(async () => []) }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ limit: null, used: 0, can_create: true }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => null }));
vi.mock('@/components/property-form/PropertyWizard', () => ({
  PropertyWizard: ({ proposition }: { proposition?: boolean }) => (
    <div data-testid="assistant">{proposition ? 'proposition' : 'publication'}</div>
  ),
}));

import Layout from '../layout';
import Page from '../page';

async function ouvrir(): Promise<string> {
  try {
    render(withIntl(await Layout({ children: await Page() })));
  } catch (e) {
    return (e as Error).message;
  }
  return screen.getByTestId('assistant').textContent ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/app/properties/new — publier, proposer ou rien (P152.03)', () => {
  it('un agent qui tient properties.create publie', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent', 'customer'] });
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['properties.create']);
    expect(await ouvrir()).toBe('publication');
  });

  it('un agent sans properties.create ni profil de bailleur est renvoyé vers la liste des biens', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent', 'customer'] });
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['team.invite']);
    expect(await ouvrir()).toBe('redirect:/app/properties');
  });

  it('un agent aussi bailleur, sans properties.create, propose', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['owner', 'agent', 'customer'] });
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['crm.view_all']);
    expect(await ouvrir()).toBe('proposition');
  });

  it('des capacités illisibles mènent à la page de vérification indisponible', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent', 'customer'] });
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(null);
    expect(await ouvrir()).toBe('redirect:/verification-indisponible');
  });
});
