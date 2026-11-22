/**
 * TCK-2908 — la liste des biens (maquette `app-biens` a, écrans e0 et e1) :
 *  · AC1 — « Tous les bailleurs » dans le panneau du mode Gestion (bureau) : choisir un bailleur écrit
 *    `owner_profile_id` dans l'URL (la page le relaie en `filter[owner_profile_id]`, filtre serveur) ; la
 *    puce le nomme et le retire ;
 *  · AC2 — la carte d'annonce rend « 312 vues · 9 contacts · 3 visites (30 j) » (`stats_30d`), au singulier
 *    « 1 contact », et plus les favoris ; sans `stats_30d`, aucune ligne de chiffres ;
 *  · AC3 — la jauge du quota porte « Offre Pro » (téléphone et bureau) ; rien sans nom d'offre.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JaugeDuQuota } from '@/components/property-dashboard/ModesDeLaListe';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem, ResumeDuPortefeuille } from '@/types/property';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
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
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
});

const RESUME = { total: 84, occupied: 61, vacant: 9, rent_late: 6, notice: 3, for_sale: 0 } as unknown as ResumeDuPortefeuille;
const BAILLEURS = [
  { id: 31, name: 'Fatou Bailleur' },
  { id: 40, name: 'Mouhamed Sène' },
];

describe('TCK-2908 (AC1) — « Tous les bailleurs »', () => {
  const rendre = (extra: Partial<React.ComponentProps<typeof PropertyListFilters>> = {}) =>
    render(withIntl(<PropertyListFilters currentUserId={1} mode="gestion" resume={RESUME} total={84} bailleurOptions={BAILLEURS} {...extra} />));

  it('le panneau du mode Gestion porte le groupe « Bailleur et agent » et la liste « Tous les bailleurs »', () => {
    rendre();
    const panneau = screen.getByTestId('panneau-de-filtres');
    expect(within(panneau).getByRole('group', { name: 'Bailleur et agent' })).toBeInTheDocument();
    expect(within(panneau).getByRole('combobox', { name: 'Bailleur' })).toHaveTextContent('Tous les bailleurs');
  });

  it('choisir un bailleur écrit `owner_profile_id={id}` (le profil) et remet la page à 1', async () => {
    nav.params = new URLSearchParams('page=3&mode=gestion');
    const user = userEvent.setup();
    rendre();
    await user.click(within(screen.getByTestId('panneau-de-filtres')).getByRole('combobox', { name: 'Bailleur' }));
    await user.click(await screen.findByRole('option', { name: 'Mouhamed Sène' }));
    const url = new URLSearchParams((nav.replace.mock.calls.at(-1)?.[0] as string).slice(1));
    expect(url.get('owner_profile_id')).toBe('40');
    expect(url.get('page')).toBeNull();
    expect(url.get('mode')).toBe('gestion');
  });

  it('la puce nomme le bailleur choisi, et le retire', async () => {
    nav.params = new URLSearchParams('owner_profile_id=31');
    const user = userEvent.setup();
    rendre();
    const puce = screen.getByRole('button', { name: /Bailleur:\s*Fatou Bailleur/ });
    await user.click(puce);
    expect(nav.replace.mock.calls.at(-1)?.[0]).toBe('?');
  });

  it('en Annonces : pas de liste, mais la puce nomme le bailleur venu de la Gestion', () => {
    nav.params = new URLSearchParams('mode=annonces&owner_profile_id=40');
    render(withIntl(<PropertyListFilters currentUserId={1} mode="annonces" bailleurOptions={BAILLEURS} />));
    expect(screen.queryByRole('combobox', { name: 'Bailleur' })).toBeNull();
    expect(screen.getByRole('button', { name: /Bailleur:\s*Mouhamed Sène/ })).toBeInTheDocument();
  });

  it('sans liste de bailleurs (lecteur sans carnet), ni liste ni groupe renommé ; le mode Annonces n’en a pas', () => {
    const { unmount } = rendre({ bailleurOptions: undefined });
    expect(screen.queryByRole('combobox', { name: 'Bailleur' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Agent et portée' })).toBeInTheDocument();
    unmount();
    render(withIntl(<PropertyListFilters currentUserId={1} mode="annonces" bailleurOptions={BAILLEURS} />));
    expect(screen.queryByRole('combobox', { name: 'Bailleur' })).toBeNull();
  });
});

let prochainId = 1;
function bien(extra: Partial<PropertyListItem> = {}): PropertyListItem {
  const id = prochainId++;
  return {
    id, reference_number: `TK-${id}`, title: `Bien ${id}`, slug: `bien-${id}`, price: 350000, currency: 'XOF',
    type: 'apartment', contract_type: 'rent', rent_period: 'monthly', status: 'available', visibility: 'public',
    is_online: true, views_count: 1240, favorites_count: 18,
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
    bedrooms: 2, bathrooms: 1, area: 60, furnished: false, featured: false, main_photo_url: null,
    published_at: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z', owner: { id: 30, name: 'Fatou Bailleur' },
    ...extra,
  } as PropertyListItem;
}
const page = (data: PropertyListItem[]) =>
  ({ data, meta: { total: data.length, current_page: 1, last_page: 1, per_page: 20 }, links: {} }) as unknown as PaginatedResponse<PropertyListItem>;

describe('TCK-2908 (AC2) — les chiffres des 30 derniers jours sur la carte d’annonce', () => {
  it('« 312 vues · 9 contacts · 3 visites (30 j) » ; au singulier « 1 contact » ; plus de favoris', () => {
    render(withIntl(<PropertyList page={page([
      bien({ stats_30d: { views: 312, contacts: 9, visits: 3 } }),
      bien({ stats_30d: { views: 1, contacts: 1, visits: 1 } }),
    ])} currentUserId={1} presentation="annonces" />));
    const [a, b] = screen.getAllByTestId('chiffres-30-jours');
    expect(a).toHaveTextContent('312 vues · 9 contacts · 3 visites (30 j)');
    expect(b).toHaveTextContent('1 vue · 1 contact · 1 visite (30 j)');
    for (const carte of screen.getAllByTestId('carte-annonce')) expect(carte).not.toHaveTextContent(/favori/);
  });

  it('sans `stats_30d`, la carte ne présente pas le compteur de toujours comme celui des 30 jours', () => {
    render(withIntl(<PropertyList page={page([bien({ stats_30d: undefined })])} currentUserId={1} presentation="annonces" />));
    expect(screen.queryByTestId('chiffres-30-jours')).toBeNull();
    expect(screen.getByTestId('carte-annonce')).not.toHaveTextContent('(30 j)');
  });
});

describe('TCK-2908 (AC3) — « Offre Pro » sur la jauge du quota', () => {
  it.each(['telephone', 'bureau'] as const)('%s : « Offre Pro » à droite du chiffre', (presentation) => {
    render(withIntl(<JaugeDuQuota used={67} limit={100} offre="Pro" presentation={presentation} />));
    expect(within(screen.getByTestId('jauge-du-quota')).getByTestId('offre-du-quota')).toHaveTextContent('Offre Pro');
  });

  it('sans nom d’offre (bailleur, refus de l’abonnement), rien', () => {
    render(withIntl(<JaugeDuQuota used={67} limit={100} offre={null} presentation="bureau" />));
    expect(screen.queryByTestId('offre-du-quota')).toBeNull();
  });
});
