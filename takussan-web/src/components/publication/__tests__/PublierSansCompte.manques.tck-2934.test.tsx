/**
 * TCK-2934 — deux manques de `/publish` (maquette `app-entree-publier`, approche A) :
 *
 * - e4 « Les photos » : « Vos photos restent sur ce téléphone… » sous `lg`, « … dans ce navigateur… » dès `lg` ;
 *   sur `/app/properties/new` (même assistant), aucune des deux (AC2) ;
 * - e1 « Le lieu » : l'aide « Introuvable ? Écrivez-le… » sous le champ du quartier, AVANT toute saisie ; sur
 *   `/app/properties/new`, l'indice d'avant, pour un quartier hors référentiel seulement (AC5b).
 *
 * Harnais de `brouillon-d-avant.tck-2819.test.tsx` : le brouillon (local ou serveur) rouvre l'étape voulue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

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

/** Un studio au mois à Dakar, sans quartier : rien n'est saisi dans le champ du quartier. */
const VALEURS = {
  type: 'studio', contract_type: 'rent', city: 'Dakar', country: 'SN',
  area: 38, bathrooms: 1, furnished: true, condition: 'good', tag_ids: [],
  price: 250000, currency: 'XOF', rent_period: 'monthly',
};
const ETAPE_DU_LIEU = 1;
const ETAPE_DES_PHOTOS = 4;

beforeEach(() => {
  serveur.draft = null;
});

async function monterSansCompte(etape: number) {
  const moteur = moteurEnMemoire();
  await moteur.ecrire('valeurs', { etape, valeurs: VALEURS, majLe: Date.now() });
  render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <PublierSansCompte brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
      </QueryClientProvider>,
    ),
  );
}

function monterConnecte(etape: number) {
  serveur.draft = { id: 1, key: 'property-create', step: etape, data: VALEURS, updated_at: null };
  render(withIntl(<PropertyWizard tags={[]} fraisDAgence={false} agenceDuChoixDuBailleur={null} />));
}

const TELEPHONE = 'Vos photos restent sur ce téléphone jusqu’à la publication : elles partent avec l’annonce.';
const NAVIGATEUR = 'Vos photos restent dans ce navigateur jusqu’à la publication : elles partent avec l’annonce.';
const AIDE = 'Introuvable ? Écrivez-le : il s’affiche tout de suite sur votre annonce, notre équipe le vérifie ensuite.';

describe('TCK-2934 (AC2) — la note des photos, sans compte seulement', () => {
  it('/publish : sous le dépôt, « sur ce téléphone » sous `lg`, « dans ce navigateur » dès `lg`', async () => {
    await monterSansCompte(ETAPE_DES_PHOTOS);
    await screen.findByRole('heading', { level: 1, name: /photos/i });
    const note = document.querySelector('[data-note-des-photos]') as HTMLElement;
    expect(note).not.toBeNull();
    // 390 : la ligne du téléphone ; 1440 : celle du navigateur — une seule visible à chaque largeur.
    expect(within(note).getByText(TELEPHONE)).toHaveClass('lg:hidden');
    expect(within(note).getByText(NAVIGATEUR)).toHaveClass('hidden', 'lg:inline');
    // Sous le dépôt des photos (maquette e4).
    expect(screen.getByTestId('media-dropzone-input').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('/app/properties/new : aucune des deux', async () => {
    monterConnecte(ETAPE_DES_PHOTOS);
    await screen.findByRole('heading', { level: 1, name: /photos/i });
    expect(screen.getByTestId('media-dropzone-input')).toBeInTheDocument();
    expect(document.querySelector('[data-note-des-photos]')).toBeNull();
    expect(screen.queryByText(TELEPHONE)).toBeNull();
    expect(screen.queryByText(NAVIGATEUR)).toBeNull();
  });
});

describe('TCK-2934 (AC5b) — l’aide du quartier, visible d’emblée sans compte', () => {
  it('/publish : sous le champ du quartier, avant toute saisie, et le champ la désigne', async () => {
    await monterSansCompte(ETAPE_DU_LIEU);
    const champ = await screen.findByLabelText(/quartier/i);
    expect(champ).toHaveValue('');
    const aide = screen.getByText(AIDE);
    expect(aide).toHaveAttribute('id', 'champ-quartier-indice');
    expect(champ).toHaveAttribute('aria-describedby', 'champ-quartier-indice');
    expect(champ.compareDocumentPosition(aide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('/app/properties/new : rien avant la saisie (l’indice ne paraît que pour un quartier hors référentiel)', async () => {
    monterConnecte(ETAPE_DU_LIEU);
    const champ = await screen.findByLabelText(/quartier/i);
    expect(champ).toHaveValue('');
    expect(screen.queryByText(AIDE)).toBeNull();
    expect(document.getElementById('champ-quartier-indice')).toBeNull();
    expect(champ).not.toHaveAttribute('aria-describedby');
  });
});
