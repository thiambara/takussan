/**
 * TCK-3010 — **le rendu de test unique** : ce que chaque test refaisait dans son `monter()` (556 `new QueryClient`,
 * 492 doublures d'`AuthContext` relevées le 2026-11-27).
 *
 * ```tsx
 * const { client } = rendre(<VisitesParLeTemps titre="Visites" />, { compte: { utilisateur: { id: 7, roles: ['agent'] } } });
 * const { result } = rendreLeHook(() => useLeases());
 * ```
 *
 * Il monte, dans l'ordre de l'application : un `QueryClient` FRAIS (sans nouvel essai : un refus se voit tout de
 * suite), le VRAI `AuthProvider` — le compte et le jeton passent par lui comme par le layout racine, et
 * `apiRequest` en tire le Bearer et `X-Active-Profile-Hint` —, les gestes de la console s'ils sont donnés
 * (`avecGestes`), et les vrais dictionnaires (`withIntl`).
 *
 * La navigation reste une ligne du fichier de test, parce qu'un `vi.mock` ne se hisse que dans le fichier qui
 * l'écrit : `vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation)`.
 * L'option `url` pose alors la requête de départ (`navigationDeTest.reinitialiser`).
 *
 * Le réseau, lui, est l'affaire de `doublerLApi()` (`api-simulee.ts`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, type RenderHookResult, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import type { User } from '@/types/user';

import { avecGestes } from './habilitations';
import { withIntl, type LocaleDeTest } from './intl';
import { navigationDeTest } from './navigation-url';

/** Le compte connecté : seules les clés que l'écran lit sont à donner (un `User` partiel, `null` compris). */
export interface CompteDeTest {
  readonly utilisateur: { readonly id: number; readonly [cle: string]: unknown };
  readonly jeton?: string;
  readonly profilActif?: string | null;
}

export const JETON_DE_TEST = 'jeton-de-test';

/** Un agent d'une agence : le compte par défaut d'un écran de `/app`. */
export const COMPTE_DE_TEST: CompteDeTest = { utilisateur: { id: 1, roles: ['agent'], agency_id: 1 } };

export interface OptionsDeRendu {
  /** `null` : un visiteur sans session. */
  readonly compte?: CompteDeTest | null;
  readonly locale?: LocaleDeTest;
  /** Les gestes d'un opérateur de la console (`avecGestes`). */
  readonly gestes?: PlatformAbilities;
  /** La requête de départ de la navigation de test (exige le `vi.mock('next/navigation', …)` du fichier). */
  readonly url?: string;
}

/**
 * L'enveloppe seule, pour un arbre que le test rend lui-même (`renderToString` puis `hydrateRoot`, par exemple) ;
 * chaque appel a son `QueryClient`.
 */
export function enveloppeDeTest({ compte = COMPTE_DE_TEST, locale = 'fr', gestes, url }: OptionsDeRendu) {
  if (url !== undefined) navigationDeTest.reinitialiser(url);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Enveloppe({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider
          initialUser={compte ? (compte.utilisateur as unknown as User) : null}
          initialToken={compte ? (compte.jeton ?? JETON_DE_TEST) : null}
          initialActiveProfileId={compte?.profilActif ?? null}
        >
          {withIntl(gestes ? avecGestes(children, gestes) : children, locale)}
        </AuthProvider>
      </QueryClientProvider>
    );
  }
  return { client, Enveloppe };
}

export function rendre(ui: ReactNode, options: OptionsDeRendu = {}): RenderResult & { readonly client: QueryClient } {
  const { client, Enveloppe } = enveloppeDeTest(options);
  return Object.assign(render(ui, { wrapper: Enveloppe }), { client });
}

export function rendreLeHook<R>(hook: () => R, options: OptionsDeRendu = {}): RenderHookResult<R, unknown> & { readonly client: QueryClient } {
  const { client, Enveloppe } = enveloppeDeTest(options);
  return Object.assign(renderHook(hook, { wrapper: Enveloppe }), { client });
}
