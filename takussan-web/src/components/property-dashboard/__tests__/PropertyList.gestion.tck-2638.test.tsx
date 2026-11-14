/**
 * TCK-2638 — la liste en mode Gestion : la carte compacte (téléphone) et le tableau (bureau) disent
 * qui occupe le bien, le loyer AVEC sa période (AC7) et l'état du mois ; aucun geste de la liste ne
 * se perd (AC5) : « Modifier » et le menu « ⋯ », la sélection et les actions groupées.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { OccupationDuBien, PropertyListItem } from '@/types/property';

const m = vi.hoisted(() => ({
  params: '',
  replace: vi.fn(),
  publier: vi.fn(),
  bulkArchive: vi.fn(),
}));

// Réserve de verif-patrimoine (2026-11-12) — les gestes de la ligne disent leur issue par un toast
// (`useGestesRapides`) ; le `ToastProvider` vit dans la coque, pas dans ce rendu (Base UI #73).
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));
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
  bulkAssignPropertiesAction: vi.fn(),
  bulkArchivePropertiesAction: (...a: unknown[]) => m.bulkArchive(...a),
  bulkUnpublishPropertiesAction: vi.fn(),
}));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => m.publier(...a),
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, setUser: vi.fn(), refreshUser: vi.fn() }),
}));

const OCCUPE: OccupationDuBien = {
  state: 'occupied',
  vacant_since: null,
  lease: { id: 47, reference_number: 'LS-1', type: 'residential_rent', status: 'active', start_date: '2026-07-01', end_date: '2027-06-30' },
  tenant: { id: 4, first_name: 'Aminata', last_name: 'Diop', phone: '+221770000000' },
  rent: { amount: 670_000, charges: null, currency: 'XOF', payment_frequency: 'monthly' },
  current_month: { status: 'late', due_date: '2026-11-05', days_late: 7, amount_due: 670_000, late_fee_outstanding: null },
};

function bien(id: number, plus: Partial<PropertyListItem> = {}): PropertyListItem {
  return {
    id,
    reference_number: `TK-${id}`,
    title: `Appartement ${id}`,
    slug: `appartement-${id}`,
    price: 650_000,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    status: 'published',
    visibility: 'public',
    views_count: 4,
    favorites_count: 1,
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2026-05-06T12:00:00.000Z',
    owner: { id: 8, name: 'Mouhamed Sène', slug: 'mouhamed-s', avatar_url: null },
    primary_contact: { id: 9, name: 'Sokhna Sène', slug: 'sokhna-s', avatar_url: null },
    primary_contact_source: 'designated',
    is_online: true,
    occupancy: OCCUPE,
    ...plus,
  } as PropertyListItem;
}

const VACANT_HORS_LIGNE = bien(2, {
  title: 'Studio',
  is_online: false,
  status: 'draft',
  visibility: 'private',
  occupancy: { ...OCCUPE, state: 'vacant', vacant_since: null, lease: null, tenant: null, rent: null, current_month: null },
});
const TRIMESTRIEL = bien(3, {
  title: 'Local commercial',
  occupancy: { ...OCCUPE, rent: { amount: 1_800_000, charges: null, currency: 'XOF', payment_frequency: 'quarterly' }, current_month: { ...OCCUPE.current_month!, status: 'paid', days_late: null } },
});
const A_VENDRE = bien(4, { title: 'Villa', contract_type: 'sale', price: 98_000_000, rent_period: null, occupancy: { ...OCCUPE, state: 'vacant', lease: null, tenant: null, rent: null, current_month: null } });

function page(biens: readonly PropertyListItem[]): PaginatedResponse<PropertyListItem> {
  return {
    data: [...biens],
    meta: { total: biens.length, current_page: 1, last_page: 1, per_page: 20 },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const rendre = (biens: readonly PropertyListItem[]) =>
  render(withIntl(<PropertyList page={page(biens)} currentUserId={1} agentOptions={[{ id: 9, name: 'Sokhna Sène' }]} presentation="gestion" />));

const cartes = () => within(screen.getByRole('list', { name: 'Biens en gestion' }));
const tableau = () => within(screen.getByRole('table'));

beforeEach(() => {
  m.params = 'mode=gestion';
  m.replace.mockReset();
  m.publier.mockReset();
  m.bulkArchive.mockReset();
});

describe('PropertyList — carte du mode Gestion (téléphone)', () => {
  it('trois lignes : titre · quartier, le locataire et la fin du bail, le loyer avec sa période et l’état du mois', () => {
    rendre([bien(1)]);
    const carte = within(cartes().getByTestId('carte-gestion'));

    expect(carte.getByRole('link', { name: 'Appartement 1 · Mermoz' })).toHaveAttribute('href', '/app/properties/1');
    expect(carte.getByText('Aminata Diop · bail jusqu’au 30 juin 2027')).toBeInTheDocument();
    expect(carte.getByText(/670\s000\sF/).textContent).toMatch(/670\s000\sF \/ mois/);
    // AC1 (2026-11-14) — sur 226 px, « 1 825 000 F / mois » et « En retard de 9 j » passaient à la
    // ligne : la carte gagnait 24 px et le sixième bien quittait le premier écran sous « Retards
    // d'abord ». Le retard prend la forme courte de la colonne du tableau ; les autres états restent.
    // À l'écran, la forme courte ; aux lecteurs d'écran, la phrase entière (décision du team-lead).
    const puce = carte.getByTestId('etat-du-mois');
    expect(within(puce).getByText('Retard 7 j')).toHaveAttribute('aria-hidden', 'true');
    expect(within(puce).getByText('En retard de 7 jours')).toHaveClass('sr-only');
  });

  it('AC1 : seul le retard se raccourcit sur la carte — le préavis garde sa date', () => {
    const preavis = bien(5, {
      occupancy: { ...OCCUPE, state: 'notice', current_month: { ...OCCUPE.current_month!, status: 'paid', days_late: null } },
    });
    rendre([preavis]);
    expect(within(cartes().getByTestId('carte-gestion')).getByTestId('etat-du-mois').textContent).toBe('Préavis · sortie le 30 juin 2027');
  });

  it('un bien vacant à louer, hors ligne : « Sans locataire · bailleur » et « Publier l’annonce », qui publie', async () => {
    m.publier.mockResolvedValue({ ok: true, data: { status: 'published' } });
    rendre([VACANT_HORS_LIGNE]);
    const carte = within(cartes().getByTestId('carte-gestion'));

    expect(carte.getByText('Sans locataire · Mouhamed Sène')).toBeInTheDocument();
    expect(carte.getByTestId('etat-du-mois').textContent).toBe('Vacant');
    await userEvent.click(carte.getByRole('button', { name: 'Publier l’annonce — Studio' }));
    await waitFor(() => expect(m.publier).toHaveBeenCalledWith(2, { acceptTerms: false }));
  });

  it('« Publier l’annonce » ne se propose ni pour un bien en ligne, ni pour un bien occupé', () => {
    rendre([bien(1), bien(5, { is_online: true, occupancy: { ...OCCUPE, state: 'vacant', tenant: null } })]);
    expect(cartes().queryByRole('button', { name: /Publier l’annonce/ })).toBeNull();
  });

  it('AC7 : un loyer trimestriel le dit ; un prix de vente n’a pas de période', () => {
    rendre([TRIMESTRIEL, A_VENDRE]);
    const [trimestre, vente] = cartes().getAllByTestId('carte-gestion').map((c) => within(c));

    expect(trimestre.getByText(/1\s800\s000\sF/).textContent).toMatch(/\/ trim\./);
    expect(vente.getByText('À vendre')).toBeInTheDocument();
    expect(vente.getByText(/98\s000\s000\sF/).textContent).not.toMatch(/\//);
    // « À vendre » le dit déjà : la carte ne redit pas « Prix de vente » (une ligne de moins, AC1).
    expect(vente.queryByText('Prix de vente')).toBeNull();
  });

  it('la case de sélection est hors de la photo, et le « ⋯ » porte « Modifier » en tête', async () => {
    rendre([bien(1)]);
    const carte = within(cartes().getByTestId('carte-gestion'));

    expect(carte.getByRole('checkbox', { name: /Appartement 1/ }).closest('label')).toHaveClass('size-11');
    await userEvent.click(carte.getByRole('button', { name: 'Plus d’actions — Appartement 1' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Modifier' })).toHaveAttribute('href', '/app/properties/1');
    for (const geste of ['Dépublier', 'Dupliquer', 'Archiver', 'Supprimer']) {
      expect(within(menu).getByRole('menuitem', { name: new RegExp(geste) })).toBeInTheDocument();
    }
  });

  it('AC5 : sélectionner deux biens ouvre les actions groupées, qui partent sur les deux', async () => {
    m.bulkArchive.mockResolvedValue({ ok: true, data: { updated: 2, failed: [], unchanged: 0 } });
    rendre([bien(1), bien(6)]);

    await userEvent.click(cartes().getByRole('checkbox', { name: /Appartement 1/ }));
    await userEvent.click(cartes().getByRole('checkbox', { name: /Appartement 6/ }));
    const barre = within(screen.getByRole('region', { name: /actions groupées/i }));
    expect(barre.getByText(/2/)).toBeInTheDocument();
    await userEvent.click(barre.getByRole('button', { name: /Archiver/ }));
    await waitFor(() => expect(m.bulkArchive).toHaveBeenCalledWith([1, 6]));
  });
});

describe('PropertyList — tableau du mode Gestion (bureau)', () => {
  it('les colonnes de la maquette, dans l’ordre', () => {
    rendre([bien(1)]);
    const entetes = tableau()
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim());
    expect(entetes).toEqual(['', 'Bien', 'Bailleur', 'Locataire et fin de bail', 'Loyer / mois', 'Ce mois', 'Agent', 'Actions']);
  });

  it('une ligne : bien (quartier · référence), bailleur, locataire et fin, loyer, état court, agent', () => {
    rendre([bien(1)]);
    const ligne = within(tableau().getAllByRole('row')[1]);

    expect(ligne.getByText('Mermoz · TK-1')).toBeInTheDocument();
    expect(ligne.getByText('Mouhamed Sène')).toBeInTheDocument();
    expect(ligne.getByText('Aminata Diop')).toBeInTheDocument();
    expect(ligne.getByText('jusqu’au 30 juin 2027')).toBeInTheDocument();
    // La colonne dit « / mois » : la cellule ne le répète pas.
    expect(ligne.getByText(/670\s000\sF/).textContent).not.toMatch(/\//);
    expect(ligne.getByTestId('etat-du-mois').textContent).toBe('Retard 7 j');
    expect(ligne.getByText('SS')).toBeInTheDocument();
    expect(ligne.getByText('Sokhna Sène')).toHaveClass('sr-only');
  });

  it('AC7 : sous « Loyer / mois », une autre période est écrite, et une vente se dit telle', () => {
    rendre([TRIMESTRIEL, A_VENDRE]);
    const [, trimestre, vente] = tableau().getAllByRole('row').map((r) => within(r));

    expect(trimestre.getByText(/1\s800\s000\sF/).textContent).toMatch(/\/ trim\./);
    expect(vente.getByText('Prix de vente')).toBeInTheDocument();
  });

  it('sans agent désigné, la colonne le dit à l’assistance', () => {
    rendre([bien(1, { primary_contact_source: 'owner' })]);
    expect(within(tableau().getAllByRole('row')[1]).getByText('Aucun agent responsable')).toHaveClass('sr-only');
  });
});

describe('PropertyList — mode Gestion : vocabulaire et états vides', () => {
  it('AC2 : le mot « Publié » n’apparaît nulle part dans la liste', () => {
    const { container } = rendre([bien(1), VACANT_HORS_LIGNE, TRIMESTRIEL, A_VENDRE]);
    expect(container.textContent).not.toMatch(/Publié/);
  });

  it('un portefeuille vide reste « vide » quand l’URL ne porte que le mode', () => {
    rendre([]);
    expect(screen.queryByRole('button', { name: /Réinitialiser|Effacer/ })).toBeNull();
  });

  it('un filtre sans résultat se réinitialise en gardant le mode', async () => {
    m.params = 'mode=gestion&occupancy=vacant';
    rendre([]);
    const bouton = screen.getByRole('button');
    await userEvent.click(bouton);
    expect(m.replace).toHaveBeenCalledWith('?mode=gestion');
  });
});
