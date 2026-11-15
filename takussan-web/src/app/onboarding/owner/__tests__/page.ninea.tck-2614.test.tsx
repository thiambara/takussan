import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2614 (r2, décision 2b du porteur, 2026-11-13), puis TCK-2613 — `/onboarding/owner` lit les pièces de CE profil
 * (`GET /api/me/pieces`, `X-Profile-Id`), où le NINEA n'est requis que d'une société, et les passe à l'assistant, qui
 * les rappelle sans en exiger aucune. Il lui passe aussi le nom de l'agence qui invite. Sans réponse, aucun rappel.
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
    data: { data: [{ type: 'owner', numeric_id: 9, status: 'draft', agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo' } }] },
  }),
}));

const reponse = vi.hoisted(() => ({ pieces: null as unknown, interlocuteur: null as unknown, echec: false, appels: [] as { path: string; headers?: Record<string, string> }[] }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async (path: string, options: { headers?: Record<string, string> } = {}) => {
    reponse.appels.push({ path, headers: options.headers });
    if (reponse.echec) throw new Error('réseau');
    // TCK-2838 — la page lit aussi l'interlocuteur du bailleur.
    if (path.startsWith('/api/me/owner-profiles/')) return { data: reponse.interlocuteur };
    return { data: reponse.pieces };
  }),
}));

type PropsDeLAssistant = { ownerProfileId: number; agence?: string | null; pieces?: unknown; interlocuteur?: unknown };
const props = vi.hoisted(() => ({ derniers: null as null | { ownerProfileId: number } }));
vi.mock('@/components/onboarding/OwnerOnboardingWizard', () => ({
  OwnerOnboardingWizard: (p: { ownerProfileId: number }) => {
    props.derniers = p;
    return null;
  },
}));

const piece = (code: string, required: boolean) => ({ code, required, kind: 'file', state: 'missing' });

/** La page rend `<OnboardingShell>` : l'assistant est son enfant, dont on lit les props. */
async function propsDeLAssistant(): Promise<PropsDeLAssistant> {
  const { default: Page } = await import('../page');
  const coque = (await Page({ searchParams: Promise.resolve({}) })) as ReactElement<{ children: ReactElement<PropsDeLAssistant> }>;
  return coque.props.children.props;
}

describe('/onboarding/owner — les pièces et l’agence passées à l’assistant (TCK-2614 2b, TCK-2613)', () => {
  beforeEach(() => {
    reponse.appels = [];
    reponse.echec = false;
    reponse.interlocuteur = null;
    props.derniers = null;
  });

  it('les pièces de CE profil, telles que l’API les juge (NINEA facultatif d’un particulier), et l’agence', async () => {
    const pieces = [piece('cni', true), piece('rib', true), piece('ninea', false)];
    reponse.pieces = pieces;
    expect(await propsDeLAssistant()).toEqual({ ownerProfileId: 9, agence: 'Dakar Immo', pieces, interlocuteur: null });
    expect(reponse.appels.filter((a) => a.path === '/api/me/pieces')).toEqual([{ path: '/api/me/pieces', headers: { 'X-Profile-Id': 'owner:9' } }]);
  });

  it('la lecture échoue : aucune pièce rappelée, l’assistant s’ouvre quand même', async () => {
    reponse.echec = true;
    expect(await propsDeLAssistant()).toEqual({ ownerProfileId: 9, agence: 'Dakar Immo', pieces: null, interlocuteur: null });
  });

  it('TCK-2838 — l’interlocuteur de CE profil, sous sparse fieldsets, passé à l’assistant', async () => {
    const interlocuteur = { source: 'inviter', first_name: 'Awa', last_name: 'Diop', role: 'agent', phone: '+221771230001', whatsapp: true };
    reponse.interlocuteur = interlocuteur;
    expect((await propsDeLAssistant()).interlocuteur).toEqual(interlocuteur);
    expect(reponse.appels.map((a) => a.path)).toContain(
      '/api/me/owner-profiles/9/interlocuteur?fields[interlocuteur]=first_name,last_name,role,phone,whatsapp',
    );
  });
});
