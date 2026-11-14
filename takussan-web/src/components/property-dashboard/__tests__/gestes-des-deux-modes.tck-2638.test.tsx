/**
 * TCK-2638, AC5 — « rien ne se perd » : chaque geste de la liste d'avant reste atteignable dans les
 * DEUX modes et dans leurs deux dispositions — la carte compacte de la Gestion (téléphone), son
 * tableau (bureau), et la carte d'annonce (les deux largeurs). Un même parcours est rejoué dans
 * chacune : le menu « ⋯ » d'une ligne (Modifier, Publier ou Dépublier, Dupliquer, Booster, le statut, Archiver,
 * Supprimer avec confirmation), puis les actions groupées sur deux biens (Archiver, Dépublier,
 * Changer l'agent responsable, le bilan par bien, Tout désélectionner).
 *
 * La pagination des deux modes et la réinitialisation des filtres se parcourent avec la page et la
 * barre : `(liste)/__tests__/gestion.tck-2638.test.tsx` (« les deux modes proposent… la pagination
 * du bureau reste ») et `PanneauDeFiltres.tck-2638.test.tsx` (« Réinitialiser » garde le mode) ; les
 * deux états vides et leur réinitialisation, ci-dessous.
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
  refresh: vi.fn(),
  supprimer: vi.fn(),
  dupliquer: vi.fn(),
  statut: vi.fn(),
  visibilite: vi.fn(),
  changerStatut: vi.fn(),
  publier: vi.fn(),
  bulkArchive: vi.fn(),
  bulkUnpublish: vi.fn(),
  bulkAssign: vi.fn(),
}));

vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, refresh: m.refresh }),
  useSearchParams: () => new URLSearchParams(m.params),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: (...a: unknown[]) => m.supprimer(...a),
  duplicatePropertyAction: (...a: unknown[]) => m.dupliquer(...a),
  updatePropertyStatusAction: (...a: unknown[]) => m.statut(...a),
  updatePropertyVisibilityAction: (...a: unknown[]) => m.visibilite(...a),
  bulkAssignPropertiesAction: (...a: unknown[]) => m.bulkAssign(...a),
  bulkArchivePropertiesAction: (...a: unknown[]) => m.bulkArchive(...a),
  bulkUnpublishPropertiesAction: (...a: unknown[]) => m.bulkUnpublish(...a),
}));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => m.publier(...a),
  changePropertyStatusAction: (...a: unknown[]) => m.changerStatut(...a),
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
  current_month: { status: 'paid', due_date: '2026-11-05', days_late: null, amount_due: 670_000, late_fee_outstanding: null },
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

function page(biens: readonly PropertyListItem[]): PaginatedResponse<PropertyListItem> {
  return {
    data: [...biens],
    meta: { total: biens.length, current_page: 1, last_page: 1, per_page: 20 },
    links: { first: null, last: null, prev: null, next: null },
  };
}

type Mode = 'gestion' | 'annonces';

/** Les trois dispositions : où chercher la ligne du bien dans le rendu. */
const DISPOSITIONS: ReadonlyArray<{ nom: string; mode: Mode; portee: () => HTMLElement }> = [
  { nom: 'Gestion — carte compacte (téléphone)', mode: 'gestion', portee: () => screen.getByRole('list', { name: 'Biens en gestion' }) },
  { nom: 'Gestion — tableau (bureau)', mode: 'gestion', portee: () => screen.getByRole('table') },
  { nom: 'Annonces — carte d’annonce (téléphone et bureau)', mode: 'annonces', portee: () => screen.getByRole('list', { name: 'Annonces' }) },
];

const rendre = (mode: Mode, biens: readonly PropertyListItem[] = [bien(1), bien(6)]) => {
  m.params = `mode=${mode}`;
  return render(
    withIntl(
      <PropertyList page={page(biens)} currentUserId={1} agentOptions={[{ id: 9, name: 'Sokhna Sène' }]} presentation={mode} />,
    ),
  );
};

async function ouvrirLeMenu(portee: HTMLElement) {
  await userEvent.click(within(portee).getByRole('button', { name: 'Plus d’actions — Appartement 1' }));
  return within(await screen.findByRole('menu'));
}

beforeEach(() => {
  for (const f of [m.replace, m.refresh, m.supprimer, m.dupliquer, m.statut, m.visibilite, m.changerStatut, m.publier, m.bulkArchive, m.bulkUnpublish, m.bulkAssign]) {
    f.mockReset();
  }
  const ok = { ok: true, data: {} };
  m.supprimer.mockResolvedValue(ok);
  m.dupliquer.mockResolvedValue(ok);
  m.statut.mockResolvedValue(ok);
  m.visibilite.mockResolvedValue(ok);
  m.changerStatut.mockResolvedValue(ok);
  m.publier.mockResolvedValue(ok);
});

describe.each(DISPOSITIONS)('AC5 — $nom : le menu « ⋯ » d’une ligne', ({ mode, portee }) => {
  it('« Modifier » mène au bien ; Booster et les statuts permis sont proposés', async () => {
    rendre(mode);
    const menu = await ouvrirLeMenu(portee());
    expect(menu.getByRole('menuitem', { name: 'Modifier' })).toHaveAttribute('href', '/app/properties/1');
    expect(menu.getByRole('menuitem', { name: /Booster/ })).toBeInTheDocument();
    // Le statut courant (« Validé ») ne se propose pas ; « Vendu » oui.
    expect(menu.queryByRole('menuitem', { name: 'Validé' })).toBeNull();
    expect(menu.getByRole('menuitem', { name: 'Vendu' })).toBeInTheDocument();
  });

  it('un bien privé : « Publier » remplace « Dépublier », et part en un geste', async () => {
    rendre(mode, [bien(1, { visibility: 'private', is_online: false }), bien(6)]);
    const menu = await ouvrirLeMenu(portee());
    expect(menu.queryByRole('menuitem', { name: 'Dépublier' })).toBeNull();
    await userEvent.click(menu.getByRole('menuitem', { name: 'Publier' }));
    await waitFor(() => expect(m.publier).toHaveBeenCalledWith(1, { acceptTerms: false }));
  });

  it('Dupliquer part en un geste', async () => {
    rendre(mode);
    const menu = await ouvrirLeMenu(portee());
    await userEvent.click(menu.getByRole('menuitem', { name: /Dupliquer/ }));
    await waitFor(() => expect(m.dupliquer).toHaveBeenCalledWith(1));
  });

  it('changer le statut part en un geste', async () => {
    rendre(mode);
    const menu = await ouvrirLeMenu(portee());
    await userEvent.click(menu.getByRole('menuitem', { name: 'Vendu' }));
    await waitFor(() => expect(m.changerStatut).toHaveBeenCalledWith(1, 'sold', { acceptTerms: false }));
  });

  it('Dépublier se confirme, puis rend le bien privé', async () => {
    rendre(mode);
    const menu = await ouvrirLeMenu(portee());
    await userEvent.click(menu.getByRole('menuitem', { name: 'Dépublier' }));
    const dialogue = within(await screen.findByRole('dialog'));
    expect(m.visibilite).not.toHaveBeenCalled();
    await userEvent.click(dialogue.getByRole('button', { name: 'Dépublier' }));
    await waitFor(() => expect(m.visibilite).toHaveBeenCalledWith(1, 'private'));
  });

  it('Archiver se confirme, puis archive', async () => {
    rendre(mode);
    const menu = await ouvrirLeMenu(portee());
    await userEvent.click(menu.getByRole('menuitem', { name: /Archiver/ }));
    const dialogue = within(await screen.findByRole('dialog'));
    expect(m.statut).not.toHaveBeenCalled();
    await userEvent.click(dialogue.getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(m.statut).toHaveBeenCalledWith(1, 'archived'));
  });

  it('Supprimer se confirme, en disant que c’est irréversible', async () => {
    rendre(mode);
    const menu = await ouvrirLeMenu(portee());
    await userEvent.click(menu.getByRole('menuitem', { name: 'Supprimer' }));
    const dialogue = within(await screen.findByRole('dialog'));
    expect(dialogue.getByText(/irréversible/)).toBeInTheDocument();
    expect(m.supprimer).not.toHaveBeenCalled();
    await userEvent.click(dialogue.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(m.supprimer).toHaveBeenCalledWith(1));
  });
});

describe.each(DISPOSITIONS)('AC5 — $nom : les actions groupées sur deux biens', ({ mode, portee }) => {
  async function selectionnerDeux() {
    const ici = within(portee());
    await userEvent.click(ici.getByRole('checkbox', { name: 'Sélectionner Appartement 1' }));
    await userEvent.click(ici.getByRole('checkbox', { name: 'Sélectionner Appartement 6' }));
    const barre = within(screen.getByRole('region', { name: 'Actions groupées' }));
    expect(barre.getByText('2 biens sélectionnés')).toBeInTheDocument();
    return barre;
  }

  it('Archiver part sur les deux, et le bilan nomme le bien refusé', async () => {
    m.bulkArchive.mockResolvedValue({
      ok: true,
      data: { updated: 1, unchanged: 0, failed: [{ id: 6, reason: 'Bail en cours' }] },
    });
    rendre(mode);
    const barre = await selectionnerDeux();
    await userEvent.click(barre.getByRole('button', { name: 'Archiver' }));
    await waitFor(() => expect(m.bulkArchive).toHaveBeenCalledWith([1, 6]));
    const bilan = await screen.findByTestId('bulk-failures');
    expect(within(bilan).getByText(/Appartement 6/)).toBeInTheDocument();
  });

  it('Dépublier part sur les deux', async () => {
    m.bulkUnpublish.mockResolvedValue({ ok: true, data: { updated: 2, unchanged: 0, failed: [] } });
    rendre(mode);
    const barre = await selectionnerDeux();
    await userEvent.click(barre.getByRole('button', { name: 'Dépublier' }));
    await waitFor(() => expect(m.bulkUnpublish).toHaveBeenCalledWith([1, 6]));
  });

  it('Changer l’agent responsable part sur les deux, vers l’agent choisi', async () => {
    m.bulkAssign.mockResolvedValue({ ok: true, data: { updated: 2, unchanged: 0, failed: [] } });
    rendre(mode);
    const barre = await selectionnerDeux();
    expect(barre.getByRole('button', { name: 'Changer l\'agent responsable' })).toBeDisabled();
    await userEvent.click(barre.getByRole('combobox', { name: 'Agent responsable…' }));
    await userEvent.click(await screen.findByRole('option', { name: /Sokhna Sène/ }));
    await userEvent.click(barre.getByRole('button', { name: 'Changer l\'agent responsable' }));
    await waitFor(() => expect(m.bulkAssign).toHaveBeenCalledWith([1, 6], 9));
  });

  it('Tout désélectionner referme la barre', async () => {
    rendre(mode);
    const barre = await selectionnerDeux();
    await userEvent.click(barre.getByRole('button', { name: 'Tout désélectionner' }));
    expect(screen.queryByRole('region', { name: 'Actions groupées' })).toBeNull();
  });
});

describe.each(['gestion', 'annonces'] as const)('AC5 — %s : les deux états vides', (mode) => {
  it('portefeuille vide : « Publier un bien » ; filtre sans résultat : la réinitialisation garde le mode', async () => {
    const { unmount } = rendre(mode, []);
    expect(screen.queryByRole('button', { name: /réinitialiser/i })).toBeNull();
    unmount();

    m.params = `mode=${mode}&search=Mermoz`;
    render(
      withIntl(<PropertyList page={page([])} currentUserId={1} agentOptions={[]} presentation={mode} />),
    );
    await userEvent.click(screen.getByRole('button', { name: /réinitialiser/i }));
    expect(m.replace).toHaveBeenCalledWith(`?mode=${mode}`);
  });
});
