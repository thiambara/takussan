/**
 * TCK-2836 — la barre d'actions groupées de « Mes biens » se branche sur la sélection de la coque au
 * téléphone (`BarreDeSelectionDeLaCoque`), et garde son créneau du `FloatingDock` au bureau (AC3).
 *
 * La coque est réduite ici à ce que la barre lit : le fournisseur des déclarations et l'emplacement
 * `#emplacement-barre-d-action`. La coque entière (barre d'onglets retirée puis rendue) est éprouvée par
 * `layout/__tests__/selection-de-la-coque.tck-2836.test.tsx`.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bulkArchivePropertiesAction } from '@/app/actions/dashboard-properties';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { EMPLACEMENT_BARRE_D_ACTION } from '@/components/ui/barre-d-action';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  bulkAssignPropertiesAction: vi.fn(),
  bulkArchivePropertiesAction: vi.fn(),
  bulkUnpublishPropertiesAction: vi.fn(),
}));

const bien = (id: number, title: string): PropertyListItem =>
  ({
    id,
    reference_number: `TK-${id}`,
    title,
    slug: `bien-${id}`,
    price: 40000,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    status: 'available',
    visibility: 'public',
    views_count: 0,
    favorites_count: 0,
    location: { quarter: null, city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
    bedrooms: 2,
    bathrooms: 1,
    area: 60,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2026-09-01T00:00:00Z',
  }) as PropertyListItem;

const page = {
  data: [bien(1, 'Villa Ngor'), bien(2, 'Studio Mermoz')],
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as PaginatedResponse<PropertyListItem>;

/** Ce que la coque lit de la déclaration, rendu dans le DOM. */
function SondeDeLaCoque() {
  const d = useDeclarationDEnTete();
  return <output data-testid="sonde">{d.selection ? 'selection' : 'aucune'}</output>;
}

function monter() {
  return render(
    withIntl(
      <FournisseurDEnTete>
        <SondeDeLaCoque />
        <main>
          <PropertyList page={page} />
        </main>
        <div id={EMPLACEMENT_BARRE_D_ACTION} data-testid="emplacement" />
      </FournisseurDEnTete>,
    ),
  );
}

function simulerLargeur(telephone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: telephone && query === '(width < 48rem)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

const cocher = async (user: ReturnType<typeof userEvent.setup>, titre: string) =>
  user.click(screen.getAllByRole('checkbox', { name: `Sélectionner ${titre}` })[0]);

afterEach(() => vi.unstubAllGlobals());

describe('TCK-2836 — au téléphone, la barre d’actions groupées prend la place des onglets', () => {
  beforeEach(() => simulerLargeur(true));

  it('AC1 — deux biens cochés : la sélection est déclarée à la coque, la barre est dans son emplacement (en flux), sans créneau du dock', async () => {
    const user = userEvent.setup();
    monter();
    expect(screen.getByTestId('sonde')).toHaveTextContent('aucune');
    await cocher(user, 'Villa Ngor');
    await cocher(user, 'Studio Mermoz');
    expect(screen.getByTestId('sonde')).toHaveTextContent('selection');
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    expect(screen.getByTestId('emplacement').contains(barre)).toBe(true);
    expect(barre.className).not.toMatch(/\bfixed\b/);
    expect(barre.style.bottom).toBe('');
    // Le contenu de la barre est inchangé (TCK-2638, hors périmètre).
    expect(within(barre).getByText('2 biens sélectionnés')).toBeInTheDocument();
    expect(within(barre).getByRole('button', { name: /Archiver/ })).toBeInTheDocument();
  });

  it('AC1 — « Tout désélectionner » : la déclaration tombe, la barre d’onglets peut revenir', async () => {
    const user = userEvent.setup();
    monter();
    await cocher(user, 'Villa Ngor');
    await user.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
    expect(screen.queryByRole('region', { name: 'Actions groupées' })).toBeNull();
    expect(screen.getByTestId('sonde')).toHaveTextContent('aucune');
  });

  it('décision 1 (b) — un lot qui vide la sélection laisse le bilan, les onglets restent masqués ; ils reviennent à la croix, pas avant', async () => {
    vi.mocked(bulkArchivePropertiesAction).mockResolvedValueOnce({ ok: true, data: { updated: 2, failed: [], unchanged: 0 } } as never);
    const user = userEvent.setup();
    monter();
    await cocher(user, 'Villa Ngor');
    await cocher(user, 'Studio Mermoz');
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    await user.click(within(barre).getByRole('button', { name: /Archiver/ }));
    // La sélection est vide (le lot a tout traité), le bilan est lu dans la barre…
    expect(await within(barre).findByRole('status')).toBeInTheDocument();
    expect(within(barre).queryByText('2 biens sélectionnés')).toBeNull();
    // …et les onglets ne reviennent PAS sous lui.
    expect(screen.getByTestId('sonde')).toHaveTextContent('selection');
    await user.click(within(barre).getByRole('button', { name: 'Tout désélectionner' }));
    expect(screen.queryByRole('region', { name: 'Actions groupées' })).toBeNull();
    expect(screen.getByTestId('sonde')).toHaveTextContent('aucune');
  });

  it('AC4 — la liste démontée pendant une sélection (page quittée) ne laisse aucune déclaration', async () => {
    const user = userEvent.setup();
    const { rerender } = monter();
    await cocher(user, 'Villa Ngor');
    expect(screen.getByTestId('sonde')).toHaveTextContent('selection');
    rerender(
      withIntl(
        <FournisseurDEnTete>
          <SondeDeLaCoque />
          <main>page suivante</main>
          <div id={EMPLACEMENT_BARRE_D_ACTION} data-testid="emplacement" />
        </FournisseurDEnTete>,
      ),
    );
    expect(screen.getByTestId('sonde')).toHaveTextContent('aucune');
  });
});

describe('TCK-2836 — AC3 : au bureau, rien ne change', () => {
  beforeEach(() => simulerLargeur(false));

  it('la barre reste flottante dans son créneau du dock, et aucune sélection n’est déclarée à la coque', async () => {
    const user = userEvent.setup();
    monter();
    await cocher(user, 'Villa Ngor');
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    expect(screen.getByTestId('emplacement').contains(barre)).toBe(false);
    expect(barre.className.split(/\s+/)).toContain('fixed');
    expect(barre.style.bottom).toBe('var(--floating-dock-base, 16px)');
    expect(screen.getByTestId('sonde')).toHaveTextContent('aucune');
  });
});
