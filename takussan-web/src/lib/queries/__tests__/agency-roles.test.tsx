import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TIMEZONE } from '@/i18n/config';
import { useAgencyRoleAssignments, useAgencyRoles } from '../agency-roles';

function mockFetch(response: unknown) {
  const spy = vi.fn(
    async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => response,
      text: async () => JSON.stringify(response),
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <NextIntlClientProvider locale="fr" messages={{}} timeZone={TIMEZONE} now={new Date()}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('agency-roles — sérialisation des requêtes (TCK-279)', () => {
  it('porte le préfixe /api et un sparse fieldset sur la liste', async () => {
    const spy = mockFetch({ data: [], meta: { total: 0 } });

    renderHook(() => useAgencyRoles(3), { wrapper });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = String(spy.mock.calls[0][0]);

    // `useApiQuery` n'ajoute PAS `/api` — l'appelant l'écrit. L'oublier rend
    // un `net::ERR_FAILED` par CORS, pas un 404 lisible.
    expect(url).toContain('/api/agencies/3/roles');
    expect(url).toContain('fields%5Bagency_roles%5D=');
    expect(url).toContain('include=capabilities');
  });

  it('sérialise user_ids en LISTE À VIRGULES, la seule forme que buildQueryString produit', async () => {
    const spy = mockFetch({ data: [] });

    renderHook(() => useAgencyRoleAssignments(3, [7, 12]), { wrapper });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = String(spy.mock.calls[0][0]);

    expect(url).toContain('/api/agencies/3/role-assignments');
    // `%2C` = la virgule. Le contrôleur découpe : sans ce découpage, la règle
    // `array` refuserait tous les appels de la console Équipe en 422.
    expect(url).toContain('user_ids=7%2C12');
    expect(url).not.toContain('user_ids%5B%5D');
  });

  it("n'émet aucune requête sans utilisateur à interroger", async () => {
    const spy = mockFetch({ data: [] });

    renderHook(() => useAgencyRoleAssignments(3, []), { wrapper });

    // `user_ids` est requis côté serveur : appeler à vide rendrait un 422
    // que rien n'attend, à chaque page vide de la console.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it('indexe le cache sur un ensemble, pas sur un ordre', async () => {
    const spy = mockFetch({ data: [] });

    const { rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useAgencyRoleAssignments(3, ids),
      { wrapper, initialProps: { ids: [12, 7] } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ ids: [7, 12] });

    // Un tri différent de la même page ne doit pas repayer la requête : la
    // clé trie, l'URL non.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
