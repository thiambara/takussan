/**
 * TCK-644 — les cartes de « Mes biens » sous `lg`, et la barre d'actions groupées.
 *
 *  - AC3 : le titre d'une carte passe sur DEUX lignes au moins (il était `truncate` : « Appartement
 *    à Liberté 4 » se lisait coupé sur une ligne) ; la référence a sa propre ligne, entière (elle
 *    finissait en « TK-2026-T8F7Q… » au bout de « type · ville · référence »).
 *  - La barre d'actions groupées se posait SOUS le bouton flottant « Messagerie » (les deux en
 *    `fixed` au même coin, z-40) : la croix « Tout désélectionner » tombait dessous. Elle prend
 *    désormais un créneau du FloatingDock, au-dessus du lanceur.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FloatingDockProvider, useFloatingDockSlot } from '@/components/floating-dock';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

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

const TITRE = 'Appartement lumineux à Liberté 4, proche du rond-point';
const REFERENCE = 'TK-2026-T8F7QX';

const bien: PropertyListItem = {
  id: 7,
  reference_number: REFERENCE,
  title: TITRE,
  slug: 'appartement',
  price: 40000,
  currency: 'XOF',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  status: 'available',
  visibility: 'public',
  views_count: 4,
  favorites_count: 1,
  location: { quarter: null, city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
  bedrooms: 2,
  bathrooms: 1,
  area: 60,
  furnished: false,
  featured: false,
  main_photo_url: null,
  published_at: null,
  created_at: '2026-09-01T00:00:00Z',
} as PropertyListItem;

const page = {
  data: [bien],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as PaginatedResponse<PropertyListItem>;

/** La liste de cartes (celle de `lg:hidden`) — la table d'ordinateur est rendue aussi sous jsdom. */
function cartes(): HTMLElement {
  return screen.getByRole('list', { name: 'Liste des biens du tableau de bord' });
}

function ancetresJusquA(el: HTMLElement, borne: HTMLElement): HTMLElement[] {
  const chaine: HTMLElement[] = [];
  for (let n: HTMLElement | null = el; n && n !== borne; n = n.parentElement) chaine.push(n);
  return chaine;
}

describe('<PropertyList> — cartes sous lg (TCK-644)', () => {
  it('AC3 — le titre passe sur deux lignes, jamais tronqué sur une seule', () => {
    render(withIntl(<PropertyList page={page} />));
    const carte = within(cartes()).getByRole('listitem');
    const titre = within(carte).getByRole('link', { name: TITRE });
    expect(titre.className.split(/\s+/)).toContain('line-clamp-2');
    for (const n of ancetresJusquA(titre, carte)) {
      expect(n.className.split(/\s+/), n.outerHTML.slice(0, 120)).not.toContain('truncate');
    }
  });

  it('AC5 — la colonne des cartes est bornée à la largeur disponible (minmax(0, 1fr))', () => {
    // Relevé au navigateur à 390 px : sans colonne déclarée, la piste implicite d'une grille se
    // dimensionne au contenu maximal — la ligne « Propriétaire · Agent » (`truncate`) élargissait
    // la carte à 498 px, bord droit et actions hors de l'écran. jsdom ne mesure rien : on garde
    // la déclaration qui borne la piste.
    render(withIntl(<PropertyList page={page} />));
    expect(cartes().className.split(/\s+/)).toContain('grid-cols-1');
  });

  it('la référence a sa ligne, entière', () => {
    render(withIntl(<PropertyList page={page} />));
    const carte = within(cartes()).getByRole('listitem');
    const reference = within(carte).getByText(`Réf. ${REFERENCE}`);
    for (const n of ancetresJusquA(reference, carte)) {
      expect(n.className.split(/\s+/), n.outerHTML.slice(0, 120)).not.toContain('truncate');
    }
  });

  it('la case de sélection offre une cible au pouce (≥ 40 px) et la sélection reste possible', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyList page={page} />));
    const carte = within(cartes()).getByRole('listitem');
    const caseACocher = within(carte).getByRole('checkbox', { name: `Sélectionner ${TITRE}` });
    const cible = caseACocher.closest('label');
    expect(cible?.className.split(/\s+/)).toContain('size-11');
    await user.click(caseACocher);
    expect(screen.getByRole('region', { name: 'Actions groupées' })).toBeInTheDocument();
  });
});

function LanceurMessagerie() {
  useFloatingDockSlot({ id: 'chat-widget-mobile-fab', corner: 'bottom-right', priority: 0, height: 48 });
  return null;
}

function avecDock(ui: ReactNode) {
  return (
    <FloatingDockProvider>
      <LanceurMessagerie />
      {ui}
    </FloatingDockProvider>
  );
}

describe('<PropertyList> — barre d’actions groupées et bouton flottant (TCK-644)', () => {
  it('la barre se pose AU-DESSUS du lanceur de messagerie, pas dessous', async () => {
    const user = userEvent.setup();
    render(withIntl(avecDock(<PropertyList page={page} />)));
    await user.click(within(cartes()).getByRole('checkbox', { name: `Sélectionner ${TITRE}` }));
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    expect(barre.style.bottom).toBe('calc(var(--floating-dock-base, 16px) + 48px + 3mm)');
    expect(barre.className.split(/\s+/)).not.toContain('bottom-3');
  });
});
