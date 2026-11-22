import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

import { FavorisQuiBougent } from '../FavorisQuiBougent';

/**
 * TCK-2625 (décision 8 a) — « Vos favoris ont bougé » : le filtre est celui de l'API
 * (`filter[price_changed]=1`), la pastille celle de la page des favoris.
 */
const reseau = vi.hoisted(() => ({ appels: [] as string[], favoris: [] as unknown[], echec: false }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, roles: ['customer'] }, token: 'jeton' }) }));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span data-testid="photo" aria-label={alt} /> }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string) => {
      const lu = decodeURIComponent(path);
      reseau.appels.push(lu);
      if (lu.startsWith('/api/favorites')) {
        if (reseau.echec) throw new reel.ApiError(500, { message: 'panne' });
        return { data: reseau.favoris, meta: { total: reseau.favoris.length, current_page: 1, last_page: 1, per_page: 2 } };
      }
      throw new Error(`requête inattendue : ${lu}`);
    }),
  };
});

function favori(id: number, ecart: number | null, titre: string, quartier: string) {
  return {
    id, property_id: 100 + id, user_id: 9, notes: null, created_at: '2026-10-01T00:00:00Z', availability: 'available', price_change: ecart,
    property: { id: 100 + id, title: titre, slug: `bien-${id}`, price: 180_000, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', main_photo_url: null, location: { quarter: quartier, city: 'Dakar' } },
  };
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<FavorisQuiBougent />}</QueryClientProvider>));
}

const texte = (n: Element) => n.textContent!.replace(/\s/g, ' ');

describe('FavorisQuiBougent — TCK-2625', () => {
  beforeEach(() => {
    reseau.appels = [];
    reseau.echec = false;
    reseau.favoris = [favori(1, -20_000, 'Studio meublé', 'Mermoz'), favori(2, -30_000, 'Deux-pièces', 'Point E')];
  });

  it('lit les favoris filtrés par l’API, deux au plus', async () => {
    monter();
    await waitFor(() => expect(reseau.appels.length).toBeGreaterThan(0));
    expect(reseau.appels[0]).toContain('filter[price_changed]=1');
    expect(reseau.appels[0]).toContain('per_page=2');
  });

  it('toutes en baisse : « prix en baisse », le prix par mois, le lieu, l’écart en vert, le lien vers le bien', async () => {
    monter();
    expect(await screen.findByRole('heading', { name: 'Vos favoris · prix en baisse' })).toBeTruthy();
    const vignettes = [...document.querySelectorAll('[data-slot="vignette-favori"]')];
    expect(vignettes).toHaveLength(2);
    expect(texte(vignettes[0]!)).toContain('180 000 F / mois');
    expect(texte(vignettes[0]!)).toContain('Studio meublé · Mermoz');
    expect(vignettes[0]!.querySelector('[data-testid="pastille-ecart"]')!.getAttribute('data-sens')).toBe('baisse');
    expect(vignettes[0]!.getAttribute('href')).toBe('/fr/properties/bien-1');
    expect(screen.getByRole('link', { name: 'Tous vos favoris' }).getAttribute('href')).toBe('/app/favorites');
  });

  it('une hausse parmi elles : le titre ne dit plus « en baisse »', async () => {
    reseau.favoris = [favori(1, -20_000, 'Studio meublé', 'Mermoz'), favori(2, 15_000, 'Deux-pièces', 'Point E')];
    monter();
    expect(await screen.findByRole('heading', { name: 'Vos favoris ont bougé' })).toBeTruthy();
    expect(screen.queryByText('Vos favoris · prix en baisse')).toBeNull();
  });

  it('sans favori qui bouge (ni écart servi) : rien', async () => {
    reseau.favoris = [favori(1, null, 'Studio meublé', 'Mermoz'), favori(2, 0, 'Deux-pièces', 'Point E')];
    const { container } = monter();
    await waitFor(() => expect(reseau.appels.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-slot="favoris-qui-bougent"]')).toBeNull();
  });

  it('en échec : l’erreur du bloc', async () => {
    reseau.echec = true;
    monter();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
