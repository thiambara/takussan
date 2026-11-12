/**
 * TCK-2638 (lot B) — la carte du mode Annonces (maquette `app-biens` a-1) et sa grille.
 *
 *  - AC7 : un loyer s'écrit avec sa période ; un prix de vente n'en a pas ;
 *  - « En ligne » ne se dit que de `is_online` (ADR-0097) : la pastille d'état suit `is_online`, jamais
 *    le statut ni la visibilité ; AC2 — autant de pastilles « En ligne » que de lignes `is_online` ;
 *  - le mot « Publié » ne s'affiche plus (le statut `published` se dit « Validé ») ;
 *  - rien ne se perd : propriétaire et agent, référence, ancienneté, vues et favoris, le « ⋯ », le lien
 *    vers le bien, et la case de sélection HORS de la photo, avec sa cible de 44 px.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));
const m = vi.hoisted(() => ({ params: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(m.params),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  bulkArchivePropertiesAction: vi.fn(),
  bulkUnpublishPropertiesAction: vi.fn(),
  bulkAssignPropertiesAction: vi.fn(),
}));

beforeEach(() => {
  m.params = '';
  m.replace.mockReset();
});

let prochainId = 1;
function bien(extra: Partial<PropertyListItem> = {}): PropertyListItem {
  const id = prochainId++;
  return {
    id,
    reference_number: `TK-2026-${id}`,
    title: `Bien ${id}`,
    slug: `bien-${id}`,
    price: 350000,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    status: 'available',
    visibility: 'public',
    is_online: true,
    views_count: 1240,
    favorites_count: 18,
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
    bedrooms: 2,
    bathrooms: 1,
    area: 60,
    furnished: false,
    featured: false,
    main_photo_url: 'https://picsum.photos/600/400',
    published_at: '2026-10-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    owner: { id: 30, name: 'Fatou Bailleur' },
    ...extra,
  } as PropertyListItem;
}

function page(data: PropertyListItem[]): PaginatedResponse<PropertyListItem> {
  return {
    data,
    meta: { total: data.length, current_page: 1, last_page: 1, per_page: 20 },
    links: { first: null, last: null, prev: null, next: null },
  } as PaginatedResponse<PropertyListItem>;
}

const rendre = (data: PropertyListItem[]) => render(withIntl(<PropertyList page={page(data)} currentUserId={1} presentation="annonces" />));
const cartes = () => screen.getAllByTestId('carte-annonce');
const etat = (carte: HTMLElement) => within(carte).queryByTestId('etat-d-annonce')?.textContent ?? null;

describe('CarteAnnonce — le prix (AC7)', () => {
  it('un loyer porte sa période ; un prix de vente n’en a pas', () => {
    rendre([
      bien({ title: 'Location', price: 350000, rent_period: 'monthly' }),
      bien({ title: 'Vente', price: 95_000_000, contract_type: 'sale', rent_period: null }),
    ]);
    const [location, vente] = cartes();
    expect(location).toHaveTextContent(/350\s000\sF\s\/\smois/);
    expect(vente).not.toHaveTextContent('/ mois');
    expect(vente).not.toHaveTextContent('Location');
  });
});

describe('CarteAnnonce — l’état d’annonce (ADR-0097)', () => {
  it('« En ligne » suit `is_online`, pas le statut ni la visibilité', () => {
    rendre([
      bien({ is_online: true, status: 'available', visibility: 'public' }),
      // Public et disponible, mais pas en ligne (un bien de test, une date de publication absente…).
      bien({ is_online: false, status: 'available', visibility: 'public' }),
      bien({ is_online: false, status: 'draft', visibility: 'private' }),
      bien({ is_online: false, status: 'pending_review', visibility: 'private' }),
    ]);
    expect(cartes().map(etat)).toEqual(['En ligne', 'Hors ligne', 'Brouillon', 'À valider']);
  });

  it('AC2 — autant de pastilles « En ligne » que de lignes `is_online`', () => {
    rendre([
      bien({ is_online: true }),
      bien({ is_online: false, status: 'rented' }),
      bien({ is_online: true, status: 'published' }),
      bien({ is_online: false, visibility: 'private' }),
    ]);
    expect(cartes().filter((c) => etat(c) === 'En ligne')).toHaveLength(2);
  });

  it('hors ligne, le statut dit pourquoi ; en ligne ou brouillon, il ne se répète pas', () => {
    rendre([
      bien({ is_online: false, status: 'rented' }),
      bien({ is_online: true, status: 'available' }),
      bien({ is_online: false, status: 'draft' }),
    ]);
    const [loue, enLigne, brouillon] = cartes();
    expect(loue).toHaveTextContent('Loué');
    expect(enLigne).not.toHaveTextContent('Disponible');
    expect(within(brouillon).getAllByText('Brouillon')).toHaveLength(1);
  });

  it('sans `is_online` (inclusion absente), l’écran ne devine pas : le statut seul', () => {
    rendre([bien({ is_online: undefined, status: 'available' })]);
    expect(etat(cartes()[0]!)).toBeNull();
    expect(cartes()[0]).toHaveTextContent('Disponible');
  });

  it('la visibilité est un réglage : « Public » ou « Privé »', () => {
    rendre([bien({ visibility: 'public' }), bien({ visibility: 'private', is_online: false })]);
    expect(within(cartes()[0]!).getByText('Public')).toBeInTheDocument();
    expect(within(cartes()[1]!).getByText('Privé')).toBeInTheDocument();
  });

  it('le mot « Publié » n’apparaît nulle part ; `published` se dit « Validé »', () => {
    const { container } = rendre([
      bien({ is_online: true, status: 'published', visibility: 'public' }),
      bien({ is_online: false, status: 'published', visibility: 'private' }),
      bien({ is_online: false, status: 'available', visibility: 'public' }),
    ]);
    expect(container.textContent).not.toMatch(/Publiée?s?\b/);
    expect(cartes()[1]).toHaveTextContent('Validé');
  });
});

describe('CarteAnnonce — rien ne se perd', () => {
  it('propriétaire, référence, ancienneté, vues et favoris, le « ⋯ » et le lien vers le bien', () => {
    rendre([bien({ title: 'Villa Fann', reference_number: 'TK-2026-ZZ9' })]);
    const carte = cartes()[0]!;
    expect(carte).toHaveTextContent('Propriétaire : Fatou Bailleur');
    expect(carte).toHaveTextContent('Réf. TK-2026-ZZ9');
    expect(carte.querySelector('time')).toHaveAttribute('dateTime', '2026-09-01T00:00:00.000Z');
    expect(carte).toHaveTextContent(/1\s240 vues · 18 favoris/);
    expect(within(carte).getByRole('button', { name: 'Plus d’actions — Villa Fann' })).toBeInTheDocument();
    expect(within(carte).getByRole('link', { name: 'Villa Fann · Mermoz' })).toHaveAttribute('href', `/app/properties/${prochainId - 1}`);
  });

  it('la case de sélection quitte la photo, offre 44 px, et ouvre les actions groupées', async () => {
    const user = userEvent.setup();
    rendre([bien({ title: 'Villa Fann' })]);
    const carte = cartes()[0]!;
    const caseACocher = within(carte).getByRole('checkbox', { name: 'Sélectionner Villa Fann' });
    expect(caseACocher.closest('label')?.className.split(/\s+/)).toContain('size-11');
    const photo = carte.querySelector('img')!.parentElement!;
    expect(photo.contains(caseACocher)).toBe(false);

    await user.click(caseACocher);
    expect(screen.getByRole('region', { name: 'Actions groupées' })).toBeInTheDocument();
  });

  it('la grille : une colonne bornée au téléphone, deux dès lg, trois dès xl', () => {
    rendre([bien()]);
    const grille = screen.getByRole('list', { name: 'Annonces' });
    expect(grille.className.split(/\s+/)).toEqual(expect.arrayContaining(['grid-cols-1', 'lg:grid-cols-2', 'xl:grid-cols-3']));
    expect(grille.className).not.toMatch(/\bmd:grid-cols/);
  });
});

describe('Annonces — les deux états vides', () => {
  it('les paramètres de la Gestion (gardés pour le retour) ne font pas d’un portefeuille vide un « filtre sans résultat »', () => {
    m.params = 'mode=annonces&occupancy=vacant&rent_late=1&voir=40';
    rendre([]);
    expect(screen.queryByRole('button', { name: /Réinitialiser|Effacer/ })).toBeNull();
  });

  it('une pastille d’annonce sans résultat se réinitialise en gardant le mode', async () => {
    m.params = 'mode=annonces&listing=draft';
    rendre([]);
    await userEvent.click(screen.getByRole('button'));
    expect(m.replace).toHaveBeenCalledWith('?mode=annonces');
  });
});

describe('CarteAnnonce — propriétaire et agent se lisent entiers', () => {
  it('la ligne passe à la ligne au lieu de couper les noms (balayage à 390 et 1280 px)', () => {
    rendre([bien({ owner: { id: 30, name: 'Mouhamed Sene' } } as Partial<PropertyListItem>)]);
    const ligne = within(cartes()[0]!).getByText(/Propriétaire :/).closest('p')!;
    expect(ligne.className.split(/\s+/)).toContain('whitespace-normal');
    expect(ligne.className.split(/\s+/)).not.toContain('whitespace-nowrap');
  });
});
