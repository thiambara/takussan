/**
 * TCK-2608 — la page d'orientation, exécutée : quand pose-t-elle la question, quand reprend-elle un
 * écran (`?etape=`), quand mène-t-elle à la destination.
 *
 * La reprise n'est pas un confort : l'ouverture de l'espace pro pose un cookie dans une server action,
 * ce qui RE-REND cette page côté serveur alors que la réponse est écrite et que le profil d'agence
 * existe — sans reprise, elle redirigeait vers `/app` au milieu de l'écran du professionnel.
 */
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockTraductionsServeur } from '@/test/intl';

vi.mock('next-intl/server', () => mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  redirect: (cible: string) => {
    throw new Error(`NEXT_REDIRECT ${cible}`);
  },
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

let moi: { first_name: string | null; phone?: string | null; preferences: { entry_intent?: string } } = { first_name: 'Awa', preferences: {} };
let profils: { agency_id: number | null }[] = [];
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => moi }));
vi.mock('@/app/actions/profiles', () => ({ getMyProfilesAction: async () => ({ ok: true, data: { data: profils } }) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: async () => {
    throw new Error('hors réseau');
  },
}));
vi.mock('@/components/entree/CoqueDEntree', () => ({ CoqueDEntree: ({ children }: { readonly children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/onboarding/orientation/Orientation', () => ({
  Orientation: ({ ecranInitial, ecrireProfessionnel }: { readonly ecranInitial: string; readonly ecrireProfessionnel?: boolean }) => (
    <p>{`[orientation : ${ecranInitial}${ecrireProfessionnel ? ', écrit professional' : ''}]`}</p>
  ),
}));

const { default: Page } = await import('../page');

async function rendre(params: { redirect?: string; etape?: string }) {
  render((await Page({ searchParams: Promise.resolve(params) })) as ReactElement);
}

beforeEach(() => {
  moi = { first_name: 'Awa', preferences: {} };
  profils = [];
});

describe('TCK-2608 — la page pose la question, ou reprend un écran', () => {
  it('sans réponse ni profil : les trois portes', async () => {
    await rendre({});
    expect(screen.getByText('[orientation : portes]')).toBeInTheDocument();
  });

  it('l’espace pro vient de s’ouvrir (réponse `professional`, profil d’agence, `?etape=pro`) : l’écran du professionnel reste', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'professional' } };
    profils = [{ agency_id: 12 }];
    await rendre({ etape: 'pro' });
    expect(screen.getByText('[orientation : pro]')).toBeInTheDocument();
  });

  it('la porte pro du site, compte neuf (`?etape=pro`, sans réponse) : l’écran du professionnel d’emblée, et la réponse s’écrit', async () => {
    await rendre({ etape: 'pro' });
    expect(screen.getByText('[orientation : pro, écrit professional]')).toBeInTheDocument();
  });

  it('la porte pro du site, compte qui a répondu autre chose, sans profil d’agence : l’écran du professionnel, la réponse se réécrit', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'publish' } };
    await rendre({ etape: 'pro' });
    expect(screen.getByText('[orientation : pro, écrit professional]')).toBeInTheDocument();
  });

  it('la porte pro du site, compte établi (profil d’agence, autre réponse) : la destination, pas l’écran', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'search' } };
    profils = [{ agency_id: 12 }];
    await expect(rendre({ etape: 'pro' })).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it('le chercheur rechargé reprend son écran', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'search' } };
    await rendre({ etape: 'chercheur' });
    expect(screen.getByText('[orientation : chercheur]')).toBeInTheDocument();
  });

  it('un compte à profil d’agence n’a pas la question', async () => {
    profils = [{ agency_id: 12 }];
    await expect(rendre({})).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it('réponse écrite, sans étape : la destination', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'professional' } };
    await expect(rendre({})).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it('une étape qui ne correspond pas à la réponse ne rouvre rien', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'skipped' } };
    await expect(rendre({ etape: 'portes' })).rejects.toThrow('NEXT_REDIRECT /app');
  });

  it('une destination explicite l’emporte sur toute étape', async () => {
    moi = { first_name: 'Awa', preferences: { entry_intent: 'professional' } };
    await expect(rendre({ etape: 'pro', redirect: '/publish' })).rejects.toThrow('NEXT_REDIRECT /publish');
  });
});
