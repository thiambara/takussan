import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2614 (r2, décision 2b du porteur, 2026-11-13) — `/onboarding/owner` n'exige le NINEA que d'une société :
 * la page lit `required` du NINEA de CE profil (`GET /api/me/pieces`, `X-Profile-Id`) et le passe à l'assistant,
 * qui ne refait pas la règle. Sans réponse, il reste requis (le comportement d'avant).
 */

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/app/actions/profiles', () => ({
  getMyProfilesAction: async () => ({ ok: true, data: { data: [{ type: 'owner', numeric_id: 9, status: 'draft' }] } }),
}));

const reponse = vi.hoisted(() => ({ pieces: null as unknown, echec: false, appels: [] as { path: string; headers?: Record<string, string> }[] }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async (path: string, options: { headers?: Record<string, string> } = {}) => {
    reponse.appels.push({ path, headers: options.headers });
    if (reponse.echec) throw new Error('réseau');
    return { data: reponse.pieces };
  }),
}));

const props = vi.hoisted(() => ({ derniers: null as null | { ownerProfileId: number; nineaRequis?: boolean } }));
vi.mock('@/components/onboarding/OwnerOnboardingWizard', () => ({
  OwnerOnboardingWizard: (p: { ownerProfileId: number; nineaRequis?: boolean }) => {
    props.derniers = p;
    return null;
  },
}));

const piece = (code: string, required: boolean) => ({ code, required, kind: 'file', state: 'missing' });

/** La page rend `<OnboardingShell>` : l'assistant est son enfant, dont on lit les props. */
async function propsDeLAssistant(): Promise<{ ownerProfileId: number; nineaRequis?: boolean }> {
  const { default: Page } = await import('../page');
  const coque = (await Page({ searchParams: Promise.resolve({}) })) as ReactElement<{ children: ReactElement<{ ownerProfileId: number; nineaRequis?: boolean }> }>;
  return coque.props.children.props;
}

describe('/onboarding/owner — le NINEA requis selon l’API (TCK-2614, décision 2b)', () => {
  beforeEach(() => {
    reponse.appels = [];
    reponse.echec = false;
    props.derniers = null;
  });

  it('particulier : l’API rend le NINEA facultatif, l’assistant ne l’exige pas — lu pour CE profil', async () => {
    reponse.pieces = [piece('cni', true), piece('rib', true), piece('ninea', false)];
    expect(await propsDeLAssistant()).toEqual({ ownerProfileId: 9, nineaRequis: false });
    expect(reponse.appels).toEqual([{ path: '/api/me/pieces', headers: { 'X-Profile-Id': 'owner:9' } }]);
  });

  it('société : requis', async () => {
    reponse.pieces = [piece('cni', true), piece('rib', true), piece('ninea', true)];
    expect((await propsDeLAssistant()).nineaRequis).toBe(true);
  });

  it('la lecture échoue : requis, comme avant', async () => {
    reponse.echec = true;
    expect((await propsDeLAssistant()).nineaRequis).toBe(true);
  });
});
