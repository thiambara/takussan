/**
 * TCK-1749 (P171.06) — les étiquettes CRM de la liste client, les équipements des deux pages de
 * bien et la console des étiquettes lisent TOUTES les pages.
 *
 * Avant : `fetchCrmTags` lisait 50 étiquettes ; les pages de bien demandaient 200 équipements, que
 * l'API ramène à 100 ; la console lisait une page de 100. Le seul maillon doublé est `apiRequest`
 * (plus les cookies de `next/headers`) : les actions et les modules de requêtes sont les vrais.
 * L'API est bouchonnée : 20 par défaut, 100 au plus, `meta.last_page`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE_NAME } from '@/lib/constants';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom === AUTH_COOKIE_NAME ? { name: nom, value: 'jeton' } : undefined),
  }),
}));

const { fetchConsoleTagsAction } = await import('@/app/actions/console');
const { fetchTagsAction } = await import('@/app/actions/admin-tags');
const { fetchCrmTags } = await import('@/lib/queries/customers');

const etiquettes = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, name: `Étiquette ${i + 1}`, slug: `e-${i + 1}` }));

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockImplementation(async (chemin: string) => {
    const u = new URL(chemin, 'http://api.test');
    const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
    const page = Number(u.searchParams.get('page') ?? 1);
    return {
      data: etiquettes.slice((page - 1) * perPage, page * perPage),
      meta: { current_page: page, last_page: Math.ceil(etiquettes.length / perPage), per_page: perPage, total: etiquettes.length },
    };
  });
});

function filtresDemandes(): (string | null)[] {
  return apiRequestMock.mock.calls.map(([chemin]) => new URL(String(chemin), 'http://api.test').searchParams.get('filter[type]'));
}

describe('TCK-1749 — les étiquettes se lisent en entier', () => {
  it('les suggestions CRM proposent la 101ᵉ étiquette', async () => {
    const tags = await fetchCrmTags('jeton');

    expect(tags).toHaveLength(101);
    expect(tags.at(-1)).toMatchObject({ id: 101 });
    expect(filtresDemandes().every((f) => f === 'crm')).toBe(true);
  });

  it('le choix des équipements d’un bien propose le 101ᵉ', async () => {
    const res = await fetchTagsAction({ filters: { type: 'amenity' } });

    expect(res.ok && res.data?.data).toHaveLength(101);
    expect(filtresDemandes().every((f) => f === 'amenity')).toBe(true);
  });

  it('la console des étiquettes reçoit la 101ᵉ', async () => {
    const res = await fetchConsoleTagsAction();

    expect(res.ok && res.data?.data.at(-1)).toMatchObject({ id: 101 });
  });
});
