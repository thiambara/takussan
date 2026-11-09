/**
 * TCK-2503 (décision 3a) — l'écran de suite d'une demande de visite propose « Préparer mon dossier »
 * pour une location AU DOSSIER seulement : jamais pour une vente (la boîte ouverte serait celle de
 * l'offre), jamais pour un séjour court (la réservation n'a pas de dossier).
 *
 * La décision vit dans `PropertyDetailContent`, qui monte la boîte de visite : c'est LÀ qu'elle se
 * garde. Les tests de la boîte n'obéissent qu'à la prop qu'on leur passe — une décision inversée
 * dans la fiche y restait verte (revue adverse, 50/50).
 *
 * La fiche est rendue pour de vrai ; ses enfants sont des doublures muettes, sauf la carte qui porte
 * « Visiter » et les deux boîtes, qui disent ce qu'elles ont reçu.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyDetailContent } from '../PropertyDetailContent';

// Le routeur de Next n'est pas monté en jsdom : tout descendant qui le lit (retour, cœur) le trouve ici.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/properties/bien-de-test',
  useSearchParams: () => new URLSearchParams(''),
  useParams: () => ({ locale: 'fr', slug: 'bien-de-test' }),
}));
// TCK-2568 — l'en-tête sur photo (agent entetes) : hors du sujet de ce fichier.
vi.mock('@/components/navigation-publique/EnTeteDePage', () => ({ EnTeteDePage: () => null }));
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
vi.mock('../components/GestesSurPhoto', () => ({ GestesSurPhoto: () => null }));
vi.mock('../components/PropertyHeader', () => ({ PropertyHeader: () => null }));
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
vi.mock('../components/PropertyShareDialog', () => ({ PropertyShareDialog: () => null }));
vi.mock('../components/PropertyContactMessageDialog', () => ({ PropertyContactMessageDialog: () => null }));
// TCK-2510 — la réservation de la fiche passe par un seul crochet : ici, il ouvre la boîte.
vi.mock('@/components/bookings/useReservationDeLaFiche', () => ({
  useReservationDeLaFiche: (_bien: unknown, _pret: boolean, ouvrirLaBoite: () => void) => ({
    ouvrir: ouvrirLaBoite,
    intention: null,
  }),
}));
vi.mock('@/hooks/useFavorite', () => ({ useFavorite: () => ({ isFavorite: false, toggle: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/context/ChatDraftContext', () => ({ useChatDraft: () => null }));
vi.mock('@/lib/queries/conversations', () => ({ usePropertyConversation: () => ({ data: undefined }) }));

function bien(contrat: Pick<PropertyDetail, 'contract_type' | 'rent_period'>): PropertyDetail {
  return {
    id: 7,
    slug: 'bien-de-test',
    title: 'Bien de test',
    reference_number: 'T-7',
    photos: [],
    tags: [],
    documents: [],
    price_history: [],
    primary_contact: null,
    owner: null,
    agency: null,
    location: { city: 'Dakar', quarter: 'Mermoz' },
    ...contrat,
  } as unknown as PropertyDetail;
}

async function ouvrirLaVisite(property: PropertyDetail) {
  const user = userEvent.setup();
  render(withIntl(<PropertyDetailContent property={property} />));
  await user.click(screen.getByRole('button', { name: 'Visiter' }));
  await screen.findByRole('dialog', { name: 'visite' });
  return user;
}

describe('fiche : « Préparer mon dossier » après une visite — décision 3a', () => {
  it('location au mois (au dossier) : proposé, et il ouvre la boîte du dossier à la place de la visite', async () => {
    const user = await ouvrirLaVisite(bien({ contract_type: 'rent', rent_period: 'monthly' }));

    await user.click(screen.getByRole('button', { name: 'Préparer mon dossier' }));
    expect(await screen.findByRole('dialog', { name: 'dossier' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'visite' })).not.toBeInTheDocument();
  });

  it('vente : jamais proposé', async () => {
    await ouvrirLaVisite(bien({ contract_type: 'sale', rent_period: null }));
    expect(screen.getByText('sans dossier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Préparer mon dossier' })).not.toBeInTheDocument();
  });

  it('séjour court (à la nuit) : jamais proposé', async () => {
    await ouvrirLaVisite(bien({ contract_type: 'rent', rent_period: 'daily' }));
    expect(screen.getByText('sans dossier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Préparer mon dossier' })).not.toBeInTheDocument();
  });
});
