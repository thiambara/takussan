/**
 * TCK-2508 — AC3 : le lien de sélection partagée, des deux côtés.
 *
 * - Envoyeur : le lien ne porte QUE des identifiants de biens disponibles — ni nom, ni note.
 * - Destinataire (session privée : aucun compte, magasin vide) : les mêmes biens publics, dans
 *   l'ordre de l'envoi, sans note ni nom ; un bien devenu loué (absent de `by-ids`) n'y est plus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { SelectionPartagee } from '../SelectionPartagee';
import { PublicFavoritesPage } from '../PublicFavoritesPage';

let recherche = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/favorites',
  useSearchParams: () => recherche,
}));
let auth: { user: { id: number; name?: string } | null; token: string | null; isLoading: boolean } = {
  user: null,
  token: null,
  isLoading: false,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));

function stubObservateur() {
  class ObservateurInerte {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
}

function bien(id: number, title: string) {
  return {
    id,
    slug: `bien-${id}`,
    title,
    price: 400_000,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: '2026-10-01T10:00:00Z',
    created_at: '2026-10-01T10:00:00Z',
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  };
}

const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

function monte(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>{ui}</CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  stubObservateur();
  localStorage.clear();
  recherche = new URLSearchParams('');
});
afterEach(() => vi.unstubAllGlobals());

describe('envoyeur — le lien partagé', () => {
  it('ne porte que les identifiants des biens DISPONIBLES, ni nom ni note', async () => {
    auth = { user: { id: 1, name: 'Awa Diop' }, token: 'jeton', isLoading: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const url = new URL(String(u), 'http://api.test');
        if (url.pathname === '/api/favorites') {
          return json({
            data: [
              { id: 1, property_id: 3, user_id: 1, notes: 'Demander le parking', created_at: '2026-11-01', availability: 'available', price_change: null, property: bien(3, 'Villa Ngor') },
              { id: 2, property_id: 9, user_id: 1, notes: null, created_at: '2026-11-01', availability: 'rented', price_change: null, property: { id: 9, slug: 'x', title: 'Loué' } },
              { id: 3, property_id: 5, user_id: 1, notes: null, created_at: '2026-11-01', availability: 'available', price_change: null, property: bien(5, 'Studio Fann') },
            ],
            meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
          });
        }
        return json({ data: [] });
      }),
    );
    const user = userEvent.setup();
    monte(<PublicFavoritesPage />);

    await screen.findAllByTestId('favori-suivi');
    // Deux déclencheurs (téléphone, bureau) : le premier suffit.
    await user.click(screen.getAllByRole('button', { name: 'Partager' })[0]);
    const whatsapp = await screen.findByRole('link', { name: 'Envoyer sur WhatsApp' });
    const texte = decodeURIComponent(new URL(whatsapp.getAttribute('href') as string).searchParams.get('text') ?? '');
    expect(texte).toContain('/fr/favorites/shared?ids=3,5');
    expect(texte).not.toMatch(/ids=[^ ]*9/);
    expect(texte).not.toContain('Awa');
    expect(texte).not.toContain('parking');
  });
});

describe('destinataire — AC3', () => {
  it('les mêmes biens publics, dans l’ordre, sans note ni nom ; un bien devenu loué n’y figure plus', async () => {
    auth = { user: null, token: null, isLoading: false };
    recherche = new URLSearchParams('ids=5,9,3');
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        urls.push(String(u));
        // 9 a été loué depuis l'envoi : `by-ids` ne le rend plus.
        return json({ data: [bien(3, 'Villa Ngor'), bien(5, 'Studio Fann')], meta: { requested_ids: [3, 5, 9], returned_ids: [3, 5] } });
      }),
    );

    monte(<SelectionPartagee />);

    const grille = await screen.findByTestId('selection-partagee');
    const titres = within(grille).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titres).toEqual(['Studio Fann', 'Villa Ngor']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 biens choisis pour vous');
    expect(document.body.textContent).not.toMatch(/Awa|parking|note/i);
    expect(new URL(urls[0], 'http://api.test').pathname).toBe('/api/public/properties/by-ids');
    // Le destinataire ne reçoit rien dans SES favoris sans geste.
    expect(localStorage.getItem('takussan.favorites')).toBeNull();
  });

  it('un lien dont plus aucun bien n’est public dit pourquoi la page est vide', async () => {
    auth = { user: null, token: null, isLoading: false };
    recherche = new URLSearchParams('ids=9');
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [], meta: { requested_ids: [9], returned_ids: [] } })));
    monte(<SelectionPartagee />);
    expect(await screen.findByText('Ces biens ne sont plus disponibles')).toBeInTheDocument();
  });
});
