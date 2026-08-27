import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import { TenantOnboardingChecklistWidget } from '../TenantOnboardingChecklistWidget';
import frMessages from '@/messages/fr.json';
import * as AuthContext from '@/context/AuthContext';
import * as Api from '@/lib/api';

/**
 * TCK-266 — `<TenantOnboardingChecklistWidget>` renders the four item
 * rows when an open checklist exists, and disappears entirely once the
 * checklist is completed.
 *
 * The widget orchestrates two fetch surfaces : (1) a client-side
 * `fetch('/api/leases?...')` for the active lease ids, and (2) the
 * `useApiQuery`-backed `apiRequest` for each lease's checklist. We mock
 * both layers separately to keep each test small.
 */
type FetchMock = ReturnType<typeof vi.fn>;

function setupFetchMap(routes: Record<string, { status?: number; body?: unknown }>): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = Object.keys(routes).find((needle) => url.includes(needle));
    const route = match ? routes[match] : { status: 404, body: {} };
    return {
      ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
      status: route.status ?? 200,
      json: async () => route.body ?? {},
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockAuth() {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: { id: 1, name: 'Alice', email: 'a@b.c' },
    token: 'tk',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
}

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('<TenantOnboardingChecklistWidget>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when there is no active lease', async () => {
    mockAuth();
    setupFetchMap({
      '/api/leases': { body: { data: [] } },
    });

    const { container } = render(withProviders(<TenantOnboardingChecklistWidget />));
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(container.textContent).toBe('');
  });

  it('renders the 4 items when an open checklist exists', async () => {
    mockAuth();
    setupFetchMap({
      '/api/leases': {
        body: { data: [{ id: 42, reference_number: 'LS-ABC' }] },
      },
    });

    // Mock apiRequest used by useApiQuery for the checklist read.
    vi.spyOn(Api, 'apiRequest').mockResolvedValue({
      data: {
        id: 1,
        lease_id: 42,
        user_id: 1,
        welcome_seen_at: null,
        inventory_completed_at: null,
        first_payment_at: null,
        documents_acknowledged_at: null,
        completed_at: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    } as never);

    render(withProviders(<TenantOnboardingChecklistWidget />));

    // Title interpolates the lease reference.
    await screen.findByText(/LS-ABC/);

    // The 4 item titles are rendered.
    expect(screen.getByText("Découvrir votre espace résident")).toBeInTheDocument();
    expect(screen.getByText("Signer l'état des lieux d'entrée")).toBeInTheDocument();
    expect(screen.getByText('Effectuer votre premier paiement')).toBeInTheDocument();
    expect(screen.getByText('Accuser réception de vos documents')).toBeInTheDocument();
  });

  it("mene le locataire vers un ecran qui existe pour ses deux etapes cliquables (TCK-419)", async () => {
    // AC2 — le lien « premier paiement » pointait vers `/app/payments/new?lease_id=…`, une route
    // sans `page.tsx` : un 404 servi à chaque nouveau locataire. On n'asserte donc PAS une
    // chaîne — une chaîne fausse serait tout aussi verte. On prend le `href` que le composant
    // REND, et on le confronte à l'inventaire des `page.tsx` du dépôt.
    mockAuth();
    setupFetchMap({
      '/api/leases': { body: { data: [{ id: 42, reference_number: 'LS-ABC' }] } },
    });
    vi.spyOn(Api, 'apiRequest').mockResolvedValue({
      data: {
        id: 1,
        lease_id: 42,
        user_id: 1,
        welcome_seen_at: null,
        inventory_completed_at: null,
        first_payment_at: null,
        documents_acknowledged_at: null,
        completed_at: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    } as never);

    render(withProviders(<TenantOnboardingChecklistWidget />));
    await screen.findByText(/LS-ABC/);

    const APP = path.resolve(__dirname, '../../../app/(dashboard)/app');

    /**
     * ⚠ TROIS conventions du routeur, et la troisième a été ajoutée après coup — par le lot qui
     * l'a rendue nécessaire. Une URL ne se lit pas comme un chemin de disque :
     *
     *  · un segment `[id]` accepte n'importe quelle valeur ;
     *  · un GROUPE de routes `(nom)` est un répertoire réel qui ne consomme AUCUN segment
     *    d'URL — TCK-426 en a posé trois (`app/(accueil)`, `leases/(liste)`,
     *    `maintenance/(liste)`) pour sortir des pages de la portée d'un `loading.tsx` qui leur
     *    volait leur statut HTTP. Sans cette traversée, `existe('/app/leases')` chercherait
     *    `leases/page.tsx` là où il vit désormais dans `leases/(liste)/page.tsx`, et ce test
     *    déclarerait morte une route parfaitement servie ;
     *  · un segment exact l'emporte sur un segment dynamique.
     *
     * *Un test qui traduit une URL en chemin de fichier doit connaître les conventions du
     * routeur, sinon il mesure une arborescence et prétend mesurer un produit.*
     */
    const existe = (href: string): boolean => {
      const segments = href.split('?')[0].split('#')[0].replace(/^\/app\/?/, '').split('/').filter(Boolean);
      const descendre = (dossier: string, reste: string[]): boolean => {
        if (!fs.existsSync(dossier)) return false;
        if (reste.length === 0 && fs.existsSync(path.join(dossier, 'page.tsx'))) return true;
        const entrees = fs.readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isDirectory());
        // Les groupes de routes, à `reste` INCHANGÉ, et à TOUS les niveaux — y compris quand il
        // ne reste plus de segment à consommer : c'est ce dernier cas que `leases/(liste)` exige.
        if (entrees.filter((e) => /^\(.*\)$/.test(e.name))
          .some((e) => descendre(path.join(dossier, e.name), reste))) return true;
        if (reste.length === 0) return false;
        const [tete, ...queue] = reste;
        const exact = entrees.find((e) => e.name === tete);
        const dynamique = entrees.find((e) => /^\[.+\]$/.test(e.name));
        const suivant = exact ?? dynamique;
        return suivant !== undefined && descendre(path.join(dossier, suivant.name), queue);
      };
      return descendre(APP, segments);
    };

    // Le pendant de non-vacuité : un résolveur trop complaisant rendrait le test ci-dessous vert
    // sur n'importe quel `href`, y compris un lien mort — l'inverse exact de sa raison d'être.
    expect(existe('/app/leases'), 'route servie via un groupe (liste)').toBe(true);
    expect(existe('/app/leases/42'), 'segment dynamique').toBe(true);
    expect(existe('/app'), 'route servie via le groupe (accueil)').toBe(true);
    expect(existe('/app/payments/new'), 'route inexistante').toBe(false);
    expect(existe('/app/nimporte-quoi'), 'route inexistante').toBe(false);

    for (const libelle of ['Effectuer votre premier paiement', "Signer l'état des lieux d'entrée"]) {
      const lien = screen.getByText(libelle).closest('a');
      expect(lien, libelle).not.toBeNull();
      const href = lien!.getAttribute('href') ?? '';
      expect(href, libelle).toMatch(/^\/app\//);
      expect(existe(href), `${libelle} → ${href} : aucun page.tsx sous /app`).toBe(true);
    }
  });

  it('hides itself when the checklist is completed', async () => {
    mockAuth();
    setupFetchMap({
      '/api/leases': {
        body: { data: [{ id: 99, reference_number: 'LS-DONE' }] },
      },
    });

    vi.spyOn(Api, 'apiRequest').mockResolvedValue({
      data: {
        id: 9,
        lease_id: 99,
        user_id: 1,
        welcome_seen_at: '2026-05-01T00:00:00Z',
        inventory_completed_at: '2026-05-02T00:00:00Z',
        first_payment_at: '2026-05-03T00:00:00Z',
        documents_acknowledged_at: '2026-05-04T00:00:00Z',
        completed_at: '2026-05-04T00:00:00Z',
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-04T00:00:00Z',
      },
    } as never);

    const { container } = render(withProviders(<TenantOnboardingChecklistWidget />));

    // Wait for the checklist query to settle, then assert no section is rendered.
    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
  });
});
