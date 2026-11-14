/**
 * TCK-2819 (AC2) — un brouillon écrit AVANT le redessin rouvre à la même étape, avec les mêmes valeurs,
 * photos comprises : ni migration, ni champ renommé. Les deux formes sont figées ici telles que HEAD
 * les écrit (2026-11-14) :
 *
 * - le brouillon local de `/publish` (ADR-0093) : `valeurs` = `{ etape, valeurs, majLe }` et `photos` =
 *   `[{ id, nom, type, modifieLe, octets }]`, rangés par `ouvrirBrouillonLocal` ;
 * - le brouillon serveur de `/app/properties/new` : `{ step, data }`, lu par `useWizardDraft`.
 *
 * Un redessin qui renommerait `price`, `rent_period` ou `area` (un loyer en pastilles, une surface en
 * compteur…) ferait rouvrir l'étape vide : ce test rougit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { moteurEnMemoire, ouvrirBrouillonLocal } from '@/lib/publication/brouillon-local';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({ LocationPickerMapLoader: () => <div data-testid="carte" /> }));
vi.mock('@/components/providers/UserLocationProvider', () => ({ useUserLocation: () => ({ location: null, loading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/lib/queries/referentiel-public', () => ({
  useEquipementsApprouves: () => ({ data: { data: [{ id: 7, name: 'WiFi', slug: 'wifi' }] } }),
}));
const serveur = vi.hoisted(() => ({
  draft: null as null | { id: number; key: string; step: number; data: Record<string, unknown>; updated_at: null },
}));
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    isLoading: false,
    isSaving: false,
    error: null,
    draft: serveur.draft,
    save: vi.fn(),
    flush: vi.fn(async () => ({ ok: true, ecrit: false })),
    clear: vi.fn(async () => true),
  }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: vi.fn() }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: vi.fn() }));

import { PropertyWizard } from '@/components/property-form/PropertyWizard';
import { PublierSansCompte } from '../PublierSansCompte';

/** Studio meublé de Mermoz, 38 m², 250 000 F au mois, 2 + 2 mois, 15 000 F de charges : arrêté au prix. */
const VALEURS = {
  type: 'studio', contract_type: 'rent', city: 'Dakar', quarter: 'Mermoz', country: 'SN',
  area: 38, bathrooms: 1, furnished: true, condition: 'good', tag_ids: [],
  price: 250000, currency: 'XOF', rent_period: 'monthly',
  advance_months: 2, deposit_months: 2, monthly_charges: 15000,
};
const ETAPE_DU_PRIX = 3;

beforeEach(() => {
  serveur.draft = null;
});
afterEach(() => cleanup());

const continuer = () => screen.getByRole('button', { name: /^continuer$/i });
const precedent = () => screen.getByRole('button', { name: /^précédent$/i });

/** Ce que l'étape du prix et celle des caractéristiques relisent. */
async function relireLesValeurs(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByRole('heading', { level: 1, name: /à quel prix/i })).toBeInTheDocument();
  expect((screen.getByLabelText(/^loyer|^prix/i) as HTMLInputElement).value).toMatch(/^250\s000$/);
  expect(screen.getAllByTestId('apercu-prix')[0]).toHaveTextContent(/250\s000\sF CFA \/ mois/);
  expect(screen.getAllByTestId('apercu-total-entree')[0]).toHaveTextContent(/1\s030\s000\sF CFA/);
  await user.click(precedent()); //                                         → les caractéristiques
  await screen.findByRole('heading', { level: 1, name: /parlez-nous/i });
  expect(screen.getByLabelText(/surface habitable/i)).toHaveValue(38);
  await user.click(continuer()); //                                         → le prix
}

describe('TCK-2819 — un brouillon d’avant le redessin rouvre tel quel (AC2)', () => {
  it('le brouillon local de /publish : même étape, mêmes valeurs, mêmes photos', async () => {
    const moteur = moteurEnMemoire();
    await moteur.ecrire('valeurs', { etape: ETAPE_DU_PRIX, valeurs: VALEURS, majLe: Date.now() });
    await moteur.ecrire('photos', ['salon.jpg', 'cuisine.jpg'].map((nom, i) => ({
      id: `p${i}`, nom, type: 'image/jpeg', modifieLe: 1, octets: new Blob(['x'], { type: 'image/jpeg' }),
    })));
    const user = userEvent.setup();
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <PublierSansCompte brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
        </QueryClientProvider>,
      ),
    );
    await relireLesValeurs(user);
    await user.click(continuer()); //                                       → les photos
    expect(await screen.findByText('2 photos sur 10')).toBeInTheDocument();
    expect(screen.getAllByText('1 / 2').length).toBeGreaterThan(0);
  });

  it('le brouillon serveur de /app/properties/new : même étape, mêmes valeurs', async () => {
    serveur.draft = { id: 1, key: 'property-create', step: ETAPE_DU_PRIX, data: VALEURS, updated_at: null };
    const user = userEvent.setup();
    render(withIntl(<PropertyWizard tags={[]} fraisDAgence={false} agenceDuChoixDuBailleur={null} />));
    await relireLesValeurs(user);
  });
});
