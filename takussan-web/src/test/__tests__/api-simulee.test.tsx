/**
 * TCK-3010 — le harnais lui-même : l'API simulée borne ce qu'elle sert comme la vraie (`fields[]`, `include=`),
 * nomme une clé lue sans être demandée, rend les refus à la forme qu'`ApiError` lit (TCK-3008), journalise ce que
 * Laravel recevrait (relais compris) ; le rendu de test passe le compte par le vrai `AuthProvider`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { useAuth } from '@/context/AuthContext';
import { ApiError, apiRequest } from '@/lib/api';
import { appelBff } from '@/lib/bff';

import { doublerLApi } from '../api-simulee';
import { SUPER_ADMIN } from '../habilitations';
import { rendreLeHook } from '../rendu';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
import { RESSOURCES } from '../ressources-de-l-api';

const api = doublerLApi();

const VISITE = {
  id: 41,
  status: 'scheduled',
  scheduled_at: '2026-11-20T10:00:00Z',
  visitor_display: { name: 'Mariama Fall' },
  property: { id: 10, title: 'Villa à Almadies' },
  customer: { id: 12, first_name: 'Mariama' },
};
api.servir('visites', [VISITE]);
api.servir('reservations', [{ id: 5, kind: 'offer', notes: 'Appeler après 18 h', customer: { id: 7 }, abilities: { confirm: true } }]);
api.servir('baux', [{ id: 80, status: 'active', monthly_rent: 150_000, next_due: { amount: 150_000 }, overdue_count: 0, tenant: { id: 4 } }]);

type Liste = { data: Record<string, unknown>[]; meta: { total: number } };

describe('fields[] et include=', () => {
  it('ne sert que `id`, les colonnes demandées et les blocs inclus', async () => {
    const { data, meta } = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status&include=property');

    expect(Object.keys(data[0])).toEqual(['id', 'status', 'property']);
    expect(data[0].property).toEqual({ id: 10, title: 'Villa à Almadies' });
    expect(meta.total).toBe(1);
  });

  it('sans fields[], rend la ressource entière, comme l’API', async () => {
    const { data } = await apiRequest<Liste>('/api/property-visits');

    expect(data[0]).toEqual(VISITE);
  });

  it('sert le détail `<route>/<id>` sous la même règle, et 404 pour un id inconnu', async () => {
    const { data } = await apiRequest<{ data: Record<string, unknown> }>('/api/property-visits/41?fields[property_visits]=scheduled_at');

    expect(Object.keys(data)).toEqual(['id', 'scheduled_at']);
    await expect(apiRequest('/api/property-visits/99')).rejects.toMatchObject({ status: 404 });
  });
});

describe('les réservations et les baux, selon leur description', () => {
  it('réservations : les colonnes suivent fields[bookings], les blocs que l’index charge toujours restent', async () => {
    const { data } = await apiRequest<Liste>('/api/bookings?fields[bookings]=kind');

    expect(data[0]).toEqual({ id: 5, kind: 'offer', customer: { id: 7 }, abilities: { confirm: true } });
    void data[0].notes;
    expect(() => api.verifier()).toThrow(/« notes » lue sans être demandée par fields\[bookings\]/);
  });

  it('baux : `include=due_summary` apporte ses quatre clés, `tenant` attend son inclusion', async () => {
    const { data } = await apiRequest<Liste>('/api/leases?fields[leases]=status&include=due_summary');

    expect(data[0]).toEqual({ id: 80, status: 'active', next_due: { amount: 150_000 }, overdue_count: 0 });
    void data[0].tenant;
    expect(() => api.verifier()).toThrow(/« tenant » lue sans être demandée par fields\[leases\] ni include=/);
  });
});

describe('AC1 — une clé lue hors de fields[] fait échouer le test, et elle y est nommée', () => {
  it('par `apiRequest` (Laravel en direct)', async () => {
    const { data } = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status');

    expect(data[0].status).toBe('scheduled');
    expect(() => api.verifier()).not.toThrow();
    expect(data[0].visitor_display).toBeUndefined();
    expect(() => api.verifier()).toThrow(/« visitor_display » lue sans être demandée par fields\[property_visits\] ni include= \(GET \/api\/property-visits\)/);
  });

  it('un bloc non inclus aussi', async () => {
    const { data } = await apiRequest<Liste>('/api/property-visits?fields[property_visits]=status&include=property');

    void data[0].customer;
    expect(() => api.verifier()).toThrow(/« customer »/);
  });

  it('par `appelBff` (la réponse JSON reste surveillée)', async () => {
    const { data } = await appelBff<Liste>('/api/property-visits', { params: { fields: { property_visits: ['status'] } } });

    void data[0].scheduled_at;
    expect(() => api.verifier()).toThrow(/« scheduled_at »/);
  });

  it('une requête qu’aucune déclaration ne sert est nommée aussi', async () => {
    await expect(apiRequest('/api/leases/7/renew', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);

    expect(() => api.verifier()).toThrow(/requête non doublée : POST \/api\/leases\/7\/renew/);
  });

  it('`parDefaut` la sert, pour ce test seulement', async () => {
    api.parDefaut({ data: [] });

    await expect(apiRequest('/api/agencies/3/team-today')).resolves.toEqual({ data: [] });
  });
});

describe('les refus, à la forme de l’API (TCK-3008)', () => {
  it('`apiRequest` et `appelBff` lèvent la même `ApiError`, code métier et paramètres compris', async () => {
    api.refuser('POST', /^\/api\/bookings\/\d+\/confirm$/, 409, {
      code: 'booking.dossier_closed',
      message: 'Le dossier est clos.',
      params: { since: '2026-11-01' },
    });

    for (const appel of [
      () => apiRequest('/api/bookings/5/confirm', { method: 'POST', token: 'jeton' }),
      () => appelBff('/api/bookings/5/confirm', { method: 'POST' }),
    ]) {
      const erreur = await appel().catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ApiError);
      expect(erreur).toMatchObject({ status: 409, codeMetier: 'booking.dossier_closed', params: { since: '2026-11-01' }, proseServeur: 'Le dossier est clos.' });
    }
  });

  it('un 422 de validation porte ses erreurs de champ', async () => {
    api.refuser('PATCH', '/api/leases/3', 422, { message: 'Données invalides.', errors: { monthly_rent: ['Obligatoire.'] } });

    const erreur = (await apiRequest('/api/leases/3', { method: 'PATCH', body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(erreur.status).toBe(422);
    expect(erreur.data).toEqual({ message: 'Données invalides.', errors: { monthly_rent: ['Obligatoire.'] } });
  });

  it('une déclaration faite pendant un test ne survit pas au test', async () => {
    await expect(apiRequest('/api/bookings/5/confirm', { method: 'POST' })).rejects.toMatchObject({ status: 404 });
    expect(() => api.verifier()).toThrow(/POST \/api\/bookings\/5\/confirm/);
  });
});

describe('`auRepos` : une assertion d’absence n’est pas vide', () => {
  it('la requête qu’un hook émet n’est au journal qu’après les attentes d’`apiRequest`', async () => {
    rendreLeHook(() => useQuery({ queryKey: ['repos'], queryFn: () => apiRequest('/api/property-visits') }));

    expect(api.appels()).toEqual([]);
    await api.auRepos();
    expect(api.appels('/api/property-visits')).toHaveLength(1);
  });
});

describe('le journal : ce que Laravel reçoit', () => {
  it('une URL relative passe par les relais du BFF, une absolue garde son chemin', async () => {
    api.sur('GET', '/api/admin/agencies', { data: [] });
    api.sur('GET', '/api/users', { data: [] });

    await appelBff('/api/super-admin/agencies', { params: { filter: { status: 'pending' } } });
    await appelBff('/api/admin-users');
    await apiRequest('/api/admin/agencies');

    await apiRequest('/api/users');
    // `apiRequest` pendant une impersonation : le relais same-origin (ADR-0055 §6), que Laravel reçoit sans préfixe.
    await appelBff('/api/impersonation/proxy/users');

    expect(api.appels().map((a) => `${a.methode} ${a.chemin}`)).toEqual([
      'GET /api/admin/agencies',
      'GET /api/users',
      'GET /api/admin/agencies',
      'GET /api/users',
      'GET /api/users',
    ]);
    expect(api.appels('/api/admin/agencies')[0].requete.get('filter[status]')).toBe('pending');
  });

  it('le corps JSON est décodé', async () => {
    api.sur('POST', '/api/leases', { data: { id: 9 } }, 201);

    await apiRequest('/api/leases', { method: 'POST', body: { monthly_rent: 150000 } });

    expect(api.appels('/api/leases')[0].corps).toEqual({ monthly_rent: 150000 });
  });
});

describe('le rendu de test : le compte passe par le vrai `AuthProvider`', () => {
  function useMaListe() {
    const { token } = useAuth();
    return useQuery({ queryKey: ['visites', token], queryFn: () => apiRequest<Liste>('/api/property-visits', { token: token ?? undefined }) });
  }

  it('le Bearer et le profil actif partent avec l’appel, et rien d’autre ne part au montage', async () => {
    const { result } = rendreLeHook(useMaListe, { compte: { utilisateur: { id: 7 }, jeton: 'jeton-7', profilActif: '42' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.appels()).toHaveLength(1);
    expect(api.appels()[0].entetes).toMatchObject({ authorization: 'Bearer jeton-7', 'x-active-profile-hint': '42' });
  });

  it('un compte sans profil actif n’hérite pas de celui du rendu précédent', async () => {
    rendreLeHook(useMaListe, { compte: { utilisateur: { id: 7 }, jeton: 'jeton-7', profilActif: '42' } });
    await waitFor(() => expect(api.appels()).toHaveLength(1));
    const { result } = rendreLeHook(useMaListe, { compte: { utilisateur: { id: 8 }, jeton: 'jeton-8' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, second] = api.appels();
    expect(second.entetes).toMatchObject({ authorization: 'Bearer jeton-8' });
    expect(second.entetes).not.toHaveProperty('x-active-profile-hint');
  });

  it('un visiteur sans session n’envoie ni jeton ni profil', async () => {
    const { result } = rendreLeHook(useMaListe, { compte: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.appels()[0].entetes).not.toHaveProperty('authorization');
    expect(api.appels()[0].entetes).not.toHaveProperty('x-active-profile-hint');
  });

  it('la langue, les gestes de la console et la requête de départ de la navigation', () => {
    const { result } = rendreLeHook(
      () => ({ langue: useLocale(), superAdmin: usePlatformAbilities().can(), vue: useSearchParams().get('vue') }),
      { locale: 'en', gestes: SUPER_ADMIN, url: 'vue=to_confirm' },
    );

    expect(result.current).toEqual({ langue: 'en', superAdmin: true, vue: 'to_confirm' });
    expect(rendreLeHook(() => usePlatformAbilities().can()).result.current).toBe(false);
  });

  it('chaque rendu a son `QueryClient`', () => {
    const premier = rendreLeHook(() => null).client;
    const second = rendreLeHook(() => null).client;

    expect(premier).not.toBe(second);
  });
});

describe('les descriptions de ressources suivent les `Resource` PHP', () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

  /** Les clés de premier niveau du tableau que rend la méthode (12 espaces : le tableau de `return [`). */
  function clesDuPhp(fichier: string, methode: string): string[] {
    const php = readFileSync(join(RACINE, 'takussan-api', fichier), 'utf8');
    const corps = new RegExp(`function ${methode}\\(Request \\$request\\): array\\n    \\{([\\s\\S]*?)\\n    \\}\\n`).exec(php)?.[1] ?? '';
    return [...corps.matchAll(/^ {12}'([a-z_0-9]+)' =>/gm)].map((m) => m[1]);
  }

  it.each(Object.entries(RESSOURCES))('%s : chaque clé de la ressource est classée, et rien d’autre', (_nom, description) => {
    const methode = description.table === 'property_visits' ? 'toutesLesCles' : 'toArray';
    const php = clesDuPhp(description.php, methode);
    const inclusions = Object.values(description.inclusions).flat();
    const classees = new Set([...description.colonnes, ...description.calculees, ...inclusions]);

    expect(php.length).toBeGreaterThan(10);
    expect(php.filter((c) => !classees.has(c)), 'clés de la Resource que la description ne classe pas').toEqual([]);
    expect([...description.colonnes, ...description.calculees].filter((c) => !php.includes(c)), 'clés décrites que la Resource ne rend pas').toEqual([]);
  });
});
