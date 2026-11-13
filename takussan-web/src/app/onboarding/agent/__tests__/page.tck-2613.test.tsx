import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2613 — `/onboarding/agent` passe à l'assistant l'agence qui invite, la spécialisation déjà enregistrée sur le
 * profil et les pièces de CE profil (`GET /api/me/pieces`, `X-Profile-Id`), que l'écran 2 rappelle sans en exiger
 * aucune. Sans réponse, aucun rappel, et l'assistant s'ouvre quand même.
 */

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/app/actions/profiles', () => ({
  getMyProfilesAction: async () => ({
    ok: true,
    data: {
      data: [{ type: 'agent', numeric_id: 11, status: 'draft', specialty: 'residential', agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo' } }],
    },
  }),
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

vi.mock('@/components/onboarding/AgentOnboardingWizard', () => ({ AgentOnboardingWizard: () => null }));

type PropsDeLAssistant = { agentProfileId: number; agence?: string | null; specialite?: string | null; pieces?: unknown };

async function rendu(): Promise<ReactElement<{ children: ReactElement<PropsDeLAssistant>; sortie?: string; largeur?: string; brouillon?: boolean }>> {
  const { default: Page } = await import('../page');
  return (await Page({ searchParams: Promise.resolve({}) })) as ReactElement<{
    children: ReactElement<PropsDeLAssistant>;
    sortie?: string;
    largeur?: string;
    brouillon?: boolean;
  }>;
}

describe('/onboarding/agent — l’agence, la spécialisation et les pièces passées à l’assistant (TCK-2613)', () => {
  beforeEach(() => {
    reponse.appels = [];
    reponse.echec = false;
  });

  it('les pièces de CE profil, l’agence et la spécialisation ; la coque dit « Quitter » et garde le brouillon', async () => {
    const pieces = [{ code: 'license', required: true, kind: 'file', state: 'missing' }];
    reponse.pieces = pieces;
    const coque = await rendu();
    expect(coque.props.children.props).toEqual({ agentProfileId: 11, agence: 'Dakar Immo', specialite: 'residential', pieces });
    expect(coque.props.sortie).toBe('quitter');
    expect(coque.props.largeur).toBe('assistant');
    expect(coque.props.brouillon).toBe(true);
    expect(reponse.appels).toEqual([{ path: '/api/me/pieces', headers: { 'X-Profile-Id': 'agent:11' } }]);
  });

  it('la lecture des pièces échoue : aucun rappel, l’assistant s’ouvre quand même', async () => {
    reponse.echec = true;
    expect((await rendu()).props.children.props).toEqual({ agentProfileId: 11, agence: 'Dakar Immo', specialite: 'residential', pieces: null });
  });
});
