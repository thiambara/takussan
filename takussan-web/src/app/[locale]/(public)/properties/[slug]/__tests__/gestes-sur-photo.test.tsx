/**
 * TCK-2503 — au téléphone, la fiche n'a pas de barre du site (TCK-2568) : « partager » et « favori »
 * se posent sur la photo, à droite du retour, comme dans la maquette (approche A). Au bureau, rien
 * ne change : ils restent sous le titre (`PropertyHeader`).
 *
 * jsdom n'applique aucune feuille de style : la frontière `md` se lit dans les classes, comme le font
 * les autres gardes de responsive du dépôt ; le navigateur la mesure (390 et 1440, Notes du ticket).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyDetailContent } from '../PropertyDetailContent';

vi.mock('@/components/favorites/FavoriteButton', () => ({
  FavoriteButton: ({ propertyId, surPhoto }: { propertyId: number; surPhoto?: boolean }) => (
    <button type="button" aria-label="Ajouter aux favoris" data-property={propertyId} data-sur-photo={String(Boolean(surPhoto))} />
  ),
}));
vi.mock('@/components/compare/CompareToggleAction', () => ({ CompareToggleAction: () => null }));

// Le routeur de Next n'est pas monté en jsdom : tout descendant qui le lit (retour, cœur) le trouve ici.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/properties/bien-de-test',
  useSearchParams: () => new URLSearchParams(''),
  useParams: () => ({ locale: 'fr', slug: 'bien-de-test' }),
}));
vi.mock('../components/PropertyVisitDialog', () => ({
  PropertyVisitDialog: ({ open, onPrepareApplication }: { open: boolean; onPrepareApplication?: () => void }) =>
    open ? (
      <div role="dialog" aria-label="visite">
        {onPrepareApplication ? (
          <button type="button" onClick={onPrepareApplication}>
            Préparer mon dossier
          </button>
        ) : (
          <p>sans dossier</p>
        )}
      </div>
    ) : null,
}));
vi.mock('../components/PropertyReservationDialog', () => ({
  PropertyReservationDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="dossier" /> : null),
}));
vi.mock('../components/PropertyBookingCard', () => ({
  PropertyBookingCard: ({ onRequestVisit }: { onRequestVisit: () => void }) => (
    <button type="button" onClick={onRequestVisit}>
      Visiter
    </button>
  ),
}));
// Les autres enfants : muets (chemins littéraux, sans quoi `vi.mock` n'est pas remonté).
vi.mock('../components/PropertyBreadcrumb', () => ({ PropertyBreadcrumb: () => null }));
vi.mock('../components/PropertyGalleryMosaic', () => ({ PropertyGalleryMosaic: () => null }));
vi.mock('../components/PropertyMobileGallery', () => ({ PropertyMobileGallery: () => null }));
vi.mock('../components/PropertyLightbox', () => ({ PropertyLightbox: () => null }));
vi.mock('../components/PropertySpecsStrip', () => ({ PropertySpecsStrip: () => null }));
vi.mock('../components/PropertyDescription', () => ({ PropertyDescription: () => null }));
vi.mock('../components/PropertyCharacteristics', () => ({ PropertyCharacteristics: () => null }));
vi.mock('../components/PropertyAmenities', () => ({ PropertyAmenities: () => null }));
vi.mock('../components/PropertyAgentCard', () => ({ PropertyAgentCard: () => null }));
vi.mock('../components/PropertyMobileBottomBar', () => ({ PropertyMobileBottomBar: () => null }));
vi.mock('../components/PropertyMobileContact', () => ({ PropertyMobileContact: () => null }));
vi.mock('../components/PropertyLocationMap', () => ({ PropertyLocationMap: () => null }));
vi.mock('../components/PropertyPriceHistory', () => ({ PropertyPriceHistory: () => null }));
vi.mock('../components/PropertyDocuments', () => ({ PropertyDocuments: () => null }));
vi.mock('../components/PropertyReviews', () => ({ PropertyReviews: () => null }));
vi.mock('../components/PropertyReportButton', () => ({ PropertyReportButton: () => null }));
vi.mock('../components/PropertySimilar', () => ({ PropertySimilar: () => null }));
vi.mock('../components/PropertyRecentlyViewed', () => ({ PropertyRecentlyViewed: () => null }));
vi.mock('../components/PropertySafetyNotice', () => ({ PropertySafetyNotice: () => null }));
vi.mock('../components/PropertyVirtualTour', () => ({ PropertyVirtualTour: () => null }));
vi.mock('../components/PropertyShareDialog', () => ({
  PropertyShareDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="partage" /> : null),
}));
vi.mock('../components/PropertyContactMessageDialog', () => ({ PropertyContactMessageDialog: () => null }));
// TCK-2510 — la réservation de la fiche passe par un seul crochet : ici, il ouvre la boîte.
vi.mock('@/components/bookings/useReservationDeLaFiche', () => ({
  useReservationDeLaFiche: (_bien: unknown, _pret: boolean, ouvrirLaBoite: () => void) => ({
    ouvrir: ouvrirLaBoite,
    intention: null,
  }),
}));
let favori = false;
vi.mock('@/hooks/useFavorite', () => ({ useFavorite: () => ({ isFavorite: favori, toggle: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/context/ChatDraftContext', () => ({ useChatDraft: () => null }));
vi.mock('@/lib/queries/conversations', () => ({ usePropertyConversation: () => ({ data: undefined }) }));


function bien(): PropertyDetail {
  return {
    id: 7,
    slug: 'bien-de-test',
    title: 'Bien de test',
    reference_number: 'T-7',
    price: 450000,
    contract_type: 'rent',
    rent_period: 'monthly',
    status_label: 'Disponible',
    contract_type_label: 'À louer',
    views_count: 0,
    reviews_count: 0,
    average_rating: null,
    photos: [],
    tags: [],
    documents: [],
    price_history: [],
    primary_contact: null,
    owner: null,
    agency: null,
    location: { city: 'Dakar', quarter: 'Mermoz', full: 'Mermoz, Dakar' },
  } as unknown as PropertyDetail;
}

describe('fiche au téléphone : partager et favori posés sur la photo', () => {
  it('sous le titre, le cœur plein est terracotta (primary), comme partout ailleurs', () => {
    favori = true;
    try {
      render(withIntl(<PropertyDetailContent property={bien()} />));
      const enTeteDuBien = screen.getByRole('heading', { level: 1, name: 'Bien de test' }).closest('header')!;
      const coeur = within(enTeteDuBien).getByRole('button', { name: 'Retirer des favoris' }).querySelector('svg')!;
      const classes = coeur.getAttribute('class')!.split(/\s+/);
      expect(classes).toContain('text-primary');
      expect(classes.some((c) => c.includes('destructive'))).toBe(false);
    } finally {
      favori = false;
    }
  });

  it('l’en-tête sur photo porte le retour, puis partager et favori — sous md seulement', () => {
    render(withIntl(<PropertyDetailContent property={bien()} />));
    const enTete = document.querySelector<HTMLElement>('[data-slot="en-tete-de-page"]')!;
    expect(enTete).not.toBeNull();

    const gestes = enTete.querySelector<HTMLElement>('[data-slot="gestes-sur-photo"]')!;
    expect(gestes).not.toBeNull();
    expect(gestes.className.split(/\s+/)).toContain('md:hidden');
    expect(within(gestes).getByRole('button', { name: 'Partager ce bien' })).toBeInTheDocument();
    // Le FavoriteButton partagé, en pastille pleine comme le retour.
    const favori = within(gestes).getByRole('button', { name: 'Ajouter aux favoris' });
    expect(favori).toHaveAttribute('data-property', '7');
    expect(favori).toHaveAttribute('data-sur-photo', 'true');
    // Le retour reste le premier geste de la rangée.
    expect(within(enTete).getAllByRole('link')[0]).toHaveAccessibleName('Retour');
  });

  it('partager, sur la photo, ouvre le partage de la fiche', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyDetailContent property={bien()} />));
    const gestes = document.querySelector<HTMLElement>('[data-slot="gestes-sur-photo"]')!;
    await user.click(within(gestes).getByRole('button', { name: 'Partager ce bien' }));
    expect(await screen.findByRole('dialog', { name: 'partage' })).toBeInTheDocument();
  });

  it('sous le titre, partager et favori ne restent qu’à partir de md — le bureau ne change pas', () => {
    render(withIntl(<PropertyDetailContent property={bien()} />));
    const titre = screen.getByRole('heading', { level: 1, name: 'Bien de test' });
    const enTeteDuBien = titre.closest('header')!;
    for (const nom of ['Partager ce bien', 'Ajouter aux favoris']) {
      const bouton = within(enTeteDuBien).getByRole('button', { name: nom });
      const classes = bouton.className.split(/\s+/);
      expect(classes).toContain('hidden');
      expect(classes).toContain('md:inline-flex');
    }
  });
});
