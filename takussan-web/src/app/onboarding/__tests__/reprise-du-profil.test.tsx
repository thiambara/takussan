import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile, ProfileType } from '@/types/profile';

/**
 * TCK-589 — AC12 : les pages d'onboarding owner / agent / prestataire montent l'assistant sur le
 * profil que désigne le lien de reprise, sinon sur le premier profil À COMPLÉTER — jamais sur le
 * premier profil du type, déjà finalisé chez une autre agence. Pages EXÉCUTÉES ; `redirect` lève.
 */
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const getMyProfilesAction = vi.fn();
const getSpAgenciesAction = vi.fn();

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/app/actions/profiles', () => ({ getMyProfilesAction: () => getMyProfilesAction() }));
vi.mock('@/app/actions/service-provider-onboarding', () => ({
  getSpAgenciesAction: () => getSpAgenciesAction(),
}));
vi.mock('@/components/onboarding/OnboardingShell', () => ({
  OnboardingShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/onboarding/OwnerOnboardingWizard', () => ({
  OwnerOnboardingWizard: ({ ownerProfileId }: { ownerProfileId: number }) => <p>assistant {ownerProfileId}</p>,
}));
vi.mock('@/components/onboarding/AgentOnboardingWizard', () => ({
  AgentOnboardingWizard: ({ agentProfileId }: { agentProfileId: number }) => <p>assistant {agentProfileId}</p>,
}));
vi.mock('@/components/onboarding/ServiceProviderOnboardingWizard', () => ({
  ServiceProviderOnboardingWizard: ({ spProfileId }: { spProfileId: number }) => <p>assistant {spProfileId}</p>,
}));
vi.mock('@/components/onboarding/ServiceProviderMultiAgencyWelcome', () => ({
  ServiceProviderMultiAgencyWelcome: ({ spProfileId }: { spProfileId: number }) => <p>bienvenue {spProfileId}</p>,
}));

const { default: OwnerPage } = await import('../owner/page');
const { default: AgentPage } = await import('../agent/page');
const { default: SpPage } = await import('../service-provider/page');

const profil = (type: ProfileType, numeric_id: number, status: string, agency_id: number): Profile => ({
  id: `${type}:${numeric_id}`,
  type,
  numeric_id,
  agency_id,
  status,
  created_at: null,
});

type Page = (props: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactElement>;

const CAS: ReadonlyArray<readonly [string, ProfileType, string, Page]> = [
  ['bailleur', 'owner', 'owner', OwnerPage as unknown as Page],
  ['agent', 'agent', 'agent', AgentPage as unknown as Page],
  ['prestataire', 'service_provider', 'sp', SpPage as unknown as Page],
];

async function monter(page: Page, params: Record<string, string>): Promise<string> {
  try {
    render(await page({ searchParams: Promise.resolve(params) }));
  } catch (e) {
    return (e as Error).message;
  }
  return screen.getByText(/^assistant|^bienvenue/).textContent ?? '';
}

beforeEach(() => {
  redirect.mockClear();
  getSpAgenciesAction.mockResolvedValue({ ok: true, data: { data: [] } });
});

describe.each(CAS)('reprise de l’onboarding %s (AC12)', (_nom, type, param, page) => {
  it('deux profils (actif chez A, à compléter chez B) : le lien de reprise monte B', async () => {
    getMyProfilesAction.mockResolvedValue({
      ok: true,
      data: { data: [profil(type, 11, 'active', 1), profil(type, 22, 'draft', 2)] },
    });
    expect(await monter(page, { [param]: '22' })).toBe('assistant 22');
  });

  it('sans paramètre aussi : le profil à compléter, pas le premier du type', async () => {
    getMyProfilesAction.mockResolvedValue({
      ok: true,
      data: { data: [profil(type, 11, 'active', 1), profil(type, 22, 'draft', 2)] },
    });
    expect(await monter(page, {})).toBe('assistant 22');
  });

  it('un paramètre qui ne désigne aucun profil du compte retombe sur le profil à compléter', async () => {
    getMyProfilesAction.mockResolvedValue({
      ok: true,
      data: { data: [profil(type, 11, 'active', 1), profil(type, 22, 'draft', 2)] },
    });
    expect(await monter(page, { [param]: '999' })).toBe('assistant 22');
  });

  it('rien à compléter : /app', async () => {
    getMyProfilesAction.mockResolvedValue({ ok: true, data: { data: [profil(type, 11, 'active', 1)] } });
    expect(await monter(page, {})).toBe('NEXT_REDIRECT:/app');
  });
});

it('prestataire existant rattaché à une nouvelle agence : le panneau multi-agences reste (TCK-262)', async () => {
  getMyProfilesAction.mockResolvedValue({
    ok: true,
    data: { data: [profil('service_provider', 11, 'active', 1)] },
  });
  getSpAgenciesAction.mockResolvedValue({ ok: true, data: { data: [{ id: 1 }, { id: 2 }] } });
  expect(await monter(SpPage as unknown as Page, {})).toBe('bienvenue 11');
});
