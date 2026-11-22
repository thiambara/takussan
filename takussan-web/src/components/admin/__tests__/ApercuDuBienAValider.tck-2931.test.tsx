import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { fetchPropertyModerationDetail, type ModerationProperty, type PropertyModerationDetail as Detail } from '@/lib/queries/property-moderation';
import { withIntl } from '@/test/intl';
import { ApercuDuBienAValider } from '../ApercuDuBienAValider';
import { PropertyModerationDetail } from '../PropertyModerationDetail';

/**
 * TCK-2931 — le bien à valider : « Ouvrir l'aperçu complet de la fiche » (téléphone), « Ouvrir en
 * grand » (bureau), l'aperçu lui-même sous son bandeau, et « Écrire » à qui l'a soumis.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), trouver: vi.fn() }));
vi.mock('@/lib/queries/property-moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/property-moderation')>()),
  fetchPropertyModerationDetail: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@/lib/queries/conversations', () => ({ useTrouverLeFilDirect: () => nav.trouver }));
vi.mock('@/components/messages/BrouillonDirect', () => ({ BrouillonDirect: () => null }));

const BIEN: Detail = {
  id: 352,
  reference_number: 'T-352',
  title: 'Appartement aux Mamelles',
  slug: null,
  status: 'pending',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  price: 850_000,
  currency: 'XOF',
  area: 120,
  bedrooms: 3,
  bathrooms: 2,
  description: 'Bel appartement lumineux avec terrasse',
  photos: [1, 2, 3].map((id) => ({ id, url: `https://exemple.test/p${id}.webp`, full_url: `https://exemple.test/f${id}.webp` })),
  address: { street: null, neighborhood: 'Mamelles', city: 'Dakar', region: null },
  agency_id: 7,
  submitted_at: null,
  submitted_by: { id: 9, name: 'Mouhamed Sène', profile: 'owner' },
  submitted_count_in_agency: 3,
  checks: { photos_count: 3, photos_expected: 5, address_complete: true, description_words: 6, description_has_contact: false, price_vs_median: null },
} as unknown as Detail;

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function monterDetail(telephone: boolean) {
  vi.mocked(fetchPropertyModerationDetail).mockResolvedValue({ data: BIEN } as never);
  render(
    withIntl(
      <QueryClientProvider client={client()}>
        <PropertyModerationDetail property={{ id: 352, title: BIEN.title } as unknown as ModerationProperty} onModerated={vi.fn()} telephone={telephone} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  nav.push.mockReset();
  nav.trouver.mockReset();
  vi.mocked(fetchPropertyModerationDetail).mockReset();
});

describe('TCK-2931 — le bien à valider', () => {
  it('AC3 — téléphone : « Ouvrir l’aperçu complet de la fiche » mène à l’aperçu sous /app', async () => {
    monterDetail(true);
    const lien = await screen.findByRole('link', { name: /Ouvrir l’aperçu complet de la fiche/ });
    expect(lien).toHaveAttribute('href', '/app/agency/moderation/properties/352');
    expect(screen.queryByRole('link', { name: /Ouvrir en grand/ })).toBeNull();
  });

  it('AC3 — bureau : « Ouvrir en grand » mène au même aperçu', async () => {
    monterDetail(false);
    const lien = await screen.findByRole('link', { name: /Ouvrir en grand/ });
    expect(lien).toHaveAttribute('href', '/app/agency/moderation/properties/352');
  });

  it('AC4 — « Écrire » à côté de « Soumis par » reprend le fil à deux avec l’auteur du bien', async () => {
    nav.trouver.mockResolvedValue(77);
    monterDetail(false);
    const soumission = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'soumission');
    await userEvent.setup().click(within(soumission).getByRole('button', { name: 'Écrire' }));
    expect(nav.trouver).toHaveBeenCalledWith({ id: 9, name: 'Mouhamed Sène' });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/app/messages?conversation=77'));
  });

  it('AC4 — sans auteur connu, pas de « Écrire »', async () => {
    vi.mocked(fetchPropertyModerationDetail).mockResolvedValue({ data: { ...BIEN, submitted_by: null } } as never);
    render(
      withIntl(
        <QueryClientProvider client={client()}>
          <PropertyModerationDetail property={{ id: 352, title: BIEN.title } as unknown as ModerationProperty} onModerated={vi.fn()} />
        </QueryClientProvider>,
      ),
    );
    await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'soumission');
    expect(screen.queryByRole('button', { name: 'Écrire' })).toBeNull();
  });

  it('AC3 — l’aperçu rend titre, photos, prix, caractéristiques et description, sous le bandeau d’aperçu, depuis la lecture de modération', () => {
    render(
      withIntl(
        <QueryClientProvider client={client()}>
          <ApercuDuBienAValider id={352} initial={BIEN} />
        </QueryClientProvider>,
      ),
    );
    const apercu = screen.getByTestId('apercu-du-bien-a-valider');
    expect(within(apercu).getByRole('note')).toHaveTextContent('Aperçu — ce bien n’est pas encore publié');
    expect(within(apercu).getByRole('heading', { name: 'Appartement aux Mamelles' })).toBeInTheDocument();
    expect(within(apercu).getByText((_, el) => el?.getAttribute('data-slot') === 'prix-du-bien')).toHaveTextContent(/850/);
    expect(apercu).toHaveTextContent('3 chambres');
    expect(apercu).toHaveTextContent('Bel appartement lumineux avec terrasse');
    const photos = within(apercu).getByRole('list', { name: 'Toutes les photos du bien' });
    expect(within(photos).getAllByRole('listitem')).toHaveLength(3);
    expect(within(apercu).getByRole('button', { name: 'Écrire' })).toBeInTheDocument();
    expect(within(apercu).getByRole('link', { name: /Retour à la file/ })).toHaveAttribute('href', '/app/agency/moderation/properties?selected=352');
  });
});
