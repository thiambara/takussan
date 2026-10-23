import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { fetchAdminUsers } from '../admin-users';
import { useBookings } from '../bookings';
import { fetchDashboardCustomers } from '../customers';
import { useLeases } from '../leases';
import { useInvoices } from '../payments';
import { fetchDashboardProperties } from '../properties-server';
import { fetchIntegrations } from '../settings';
import { fetchAdminAgencies, fetchAdminAgencyUpgradeRequests } from '../super-admin';
import { fetchTags } from '../tags';

/**
 * TCK-1800 (P150.04) — le contrat des requêtes de lecture du front, DÉRIVÉ des fonctions et des
 * hooks de `src/lib/queries`, et rejoué par l'API (`tests/Feature/Contrat/RequetesDuFrontTest.php` :
 * aucune ne doit rendre 400).
 *
 * Ce test appelle chaque entrée d'`INVOCATIONS`, capte l'URL que `fetch` reçoit, et la compare au
 * fichier versionné `takussan-api/tests/fixtures/requetes-du-front.json`. Il rougit dès qu'un
 * `sort`, un `filter`, un `include` ou un `fields` change sans que le fichier suive :
 *
 *   node scripts/gen-requetes-du-front.mjs           # régénère le fichier
 *   node scripts/gen-requetes-du-front.mjs --check   # le vérifie (ce que fait la suite)
 *
 * Le fichier vit dans l'API pour qu'une PR qui le change déclenche API CI, qui le rejoue.
 * Ce qui est DÉRIVÉ : la chaîne de requête. Ce qui est TENU ICI : la liste des appels et leurs
 * arguments (ceux qu'un écran passe, le tri d'une colonne par exemple).
 */

/** Qui fait la requête, côté API : l'administrateur d'une agence, ou un opérateur de la console. */
type Acteur = 'agence' | 'operateur';

interface Invocation {
  readonly source: string;
  readonly acteur: Acteur;
  readonly appel: () => Promise<unknown>;
}

interface Requete {
  readonly source: string;
  readonly acteur: Acteur;
  readonly chemin: string;
  readonly parametres: Readonly<Record<string, string>>;
}

const JETON = 'jeton-de-test';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: JETON }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

/** Monte un hook de lecture et attend qu'il ait émis sa requête. */
async function monter(hook: () => unknown): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { unmount } = renderHook(hook, { wrapper });
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  unmount();
  client.clear();
}

const INVOCATIONS: readonly Invocation[] = [
  // Équipe de l'agence (`/app/agency/team`) : le tri par défaut, puis celui de chaque colonne
  // triable d'`AdminUsersTable` (P150.01 : `last_login_at` rendait 400).
  { source: 'fetchAdminUsers()', acteur: 'agence', appel: () => fetchAdminUsers() },
  {
    source: 'fetchAdminUsers(role agent, actifs, tri -last_login_at)',
    acteur: 'agence',
    appel: () => fetchAdminUsers({ role: 'agent', status: 'active', sort: '-last_login_at' }),
  },
  { source: 'fetchAdminUsers(tri first_name)', acteur: 'agence', appel: () => fetchAdminUsers({ sort: 'first_name' }) },
  { source: 'fetchAdminUsers(tri created_at)', acteur: 'agence', appel: () => fetchAdminUsers({ sort: 'created_at' }) },
  // P150.03 : les trois listes dont le type promettait une recherche que l'API refuse.
  { source: 'useLeases()', acteur: 'agence', appel: () => monter(() => useLeases()) },
  { source: 'useBookings()', acteur: 'agence', appel: () => monter(() => useBookings()) },
  { source: 'useInvoices()', acteur: 'agence', appel: () => monter(() => useInvoices()) },
  { source: 'fetchDashboardCustomers()', acteur: 'agence', appel: () => fetchDashboardCustomers(JETON) },
  { source: 'fetchDashboardProperties()', acteur: 'agence', appel: () => fetchDashboardProperties(JETON) },
  { source: 'fetchTags()', acteur: 'agence', appel: () => fetchTags(JETON) },
  { source: 'fetchIntegrations()', acteur: 'agence', appel: () => fetchIntegrations(JETON) },
  // Console (`/super-admin`), par le relais `/api/super-admin/*` → `/api/admin/*`.
  // P150.02 : les dates « Soumise du / au » rendaient 400.
  {
    source: 'fetchAdminAgencyUpgradeRequests(en attente, période)',
    acteur: 'operateur',
    appel: () =>
      fetchAdminAgencyUpgradeRequests({ status: 'pending', submittedFrom: '2026-01-01', submittedTo: '2026-12-31' }),
  },
  { source: 'fetchAdminAgencies()', acteur: 'operateur', appel: () => fetchAdminAgencies() },
];

/**
 * Les relais du BFF qui renomment le chemin (`src/app/api/admin-users/[[...path]]/route.ts`,
 * `src/app/api/super-admin/[...path]/route.ts`) : la requête rejouée est celle que l'API reçoit.
 */
const RELAIS: readonly (readonly [string, string])[] = [
  ['/api/admin-users', '/api/users'],
  ['/api/super-admin/', '/api/admin/'],
];

function versApi(url: string): { chemin: string; parametres: Record<string, string> } {
  const u = new URL(url, 'http://front.test');
  let chemin = u.pathname;
  for (const [relais, api] of RELAIS) {
    if (chemin.startsWith(relais)) {
      chemin = api + chemin.slice(relais.length);
      break;
    }
  }
  const parametres: Record<string, string> = {};
  u.searchParams.forEach((valeur, cle) => {
    if (cle in parametres) throw new Error(`${url} : paramètre « ${cle} » répété, que le fichier ne sait pas dire`);
    parametres[cle] = valeur;
  });
  return { chemin, parametres };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FICHIER = join(ROOT, 'takussan-api', 'tests', 'fixtures', 'requetes-du-front.json');

async function capter(): Promise<Requete[]> {
  const requetes: Requete[] = [];
  for (const { source, acteur, appel } of INVOCATIONS) {
    const espion = vi.fn(async () => new Response(JSON.stringify({ data: [], meta: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', espion);
    await appel();
    expect(espion, source).toHaveBeenCalledTimes(1);
    const [url] = espion.mock.calls[0] as unknown as [string];
    requetes.push({ source, acteur, ...versApi(String(url)) });
    vi.unstubAllGlobals();
  }
  return requetes;
}

function rendre(requetes: Requete[]): string {
  return `${JSON.stringify(
    {
      _: 'GÉNÉRÉ par takussan-web/scripts/gen-requetes-du-front.mjs depuis src/lib/queries — ne pas éditer à la main (TCK-1800).',
      requetes,
    },
    null,
    2,
  )}\n`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TCK-1800 — les requêtes du front, dérivées et rejouées par l’API', () => {
  it('le fichier versionné est celui que les fonctions de lecture produisent', async () => {
    const attendu = rendre(await capter());

    if (process.env.ECRIRE_REQUETES_DU_FRONT === '1') {
      writeFileSync(FICHIER, attendu);
      return;
    }

    expect(existsSync(FICHIER), `${FICHIER} absent : node scripts/gen-requetes-du-front.mjs`).toBe(true);
    expect(
      readFileSync(FICHIER, 'utf8'),
      'requetes-du-front.json ne suit plus src/lib/queries : node scripts/gen-requetes-du-front.mjs',
    ).toBe(attendu);
  });
});
