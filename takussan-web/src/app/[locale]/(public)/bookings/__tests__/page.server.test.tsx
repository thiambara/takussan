// @vitest-environment node
// Environnement `node` : la page est un composant SERVEUR, et `apiFetch` ne transmet l'IP que hors
// navigateur (`typeof window === 'undefined'`). Sous jsdom, l'AC17 serait rouge pour une raison
// fausse — ou vert pour une raison fausse. Le HTML est produit par `renderToStaticMarkup`.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-598 — `/bookings?property=<slug>`, rendu serveur.
 *
 * - **AC20** : le slug lu dans l'URL est UN segment de chemin. Brut,
 *   `?property=..%2Fproperties%3Fper_page%3D100000` faisait appeler la LISTE du catalogue au plafond
 *   choisi par le visiteur (`fetch` normalise `..`).
 * - **AC17** : l'appel est rendu POUR le visiteur, il porte son IP.
 */

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr',
  getTranslations: async () => (cle: string) => cle,
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav /> }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));
vi.mock('@/components/bookings/BookingTunnel', () => ({
  BookingTunnel: ({ property }: { property: { slug: string } }) => <div data-testid="tunnel">{property.slug}</div>,
}));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { headers } from 'next/headers';

const { default: BookingPage } = await import('../page');

const headersMock = vi.mocked(headers);
let fetchSpy: MockInstance<typeof fetch>;

function visiteur(ip: string): void {
  headersMock.mockResolvedValue(new Headers({ 'x-forwarded-for': ip }) as Awaited<ReturnType<typeof headers>>);
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
  headersMock.mockReset();
});

describe('/bookings — rendu serveur', () => {
  it.each(['../properties?per_page=100000', '.', '..', '../x'])(
    'AC20 + m2 — %j n’est pas un slug de bien : aucune requête, et l’état « introuvable »',
    async (piege) => {
      // `encodeURIComponent` laisse `.` et `..` intacts, et `fetch` les RÉSOUT : `?property=.`
      // appelait la liste du catalogue (`/api/public/properties/`), `..` appelait `/api/public/`.
      visiteur('203.0.113.1');

      const html = renderToStaticMarkup(await BookingPage({ searchParams: Promise.resolve({ property: piege }) }));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(html).toContain('not_found_title');
    },
  );

  it('un slug de bien part en UN segment encodé', async () => {
    visiteur('203.0.113.1');
    fetchSpy.mockResolvedValue(new Response('{"message":"Not Found."}', { status: 404 }));

    await BookingPage({ searchParams: Promise.resolve({ property: '-abc123' }) });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchSpy.mock.calls[0]![0])).pathname).toBe('/api/public/properties/-abc123');
  });

  it('AC17 — deux visiteurs, deux IP transmises', async () => {
    fetchSpy.mockImplementation(
      async () => new Response(JSON.stringify({ data: { slug: 'studio-abc123' } }), { status: 200 }),
    );

    visiteur('203.0.113.1');
    const premier = renderToStaticMarkup(await BookingPage({ searchParams: Promise.resolve({ property: 'studio-abc123' }) }));
    visiteur('203.0.113.2');
    renderToStaticMarkup(await BookingPage({ searchParams: Promise.resolve({ property: 'studio-abc123' }) }));

    const ips = fetchSpy.mock.calls.map(([, init]) => ((init as RequestInit).headers as Record<string, string>)['X-Forwarded-For']);
    expect(ips).toEqual(['203.0.113.1', '203.0.113.2']);
    expect(premier).toContain('data-testid="tunnel"');
  });

  it('`?property=a&property=b` n’est pas un slug : aucune requête', async () => {
    const html = renderToStaticMarkup(
      await BookingPage({ searchParams: Promise.resolve({ property: ['a', 'b'] as unknown as string }) }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain('no_property_title');
  });
});
