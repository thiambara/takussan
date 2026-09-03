'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFavorite } from '@/hooks/useFavorite';
import { recentlyViewedStorage } from '@/lib/recently-viewed';
import { formatAddressShort } from '@/lib/format/address';
import type { PropertyDetail } from '@/types/property';

import { PropertyBreadcrumb } from './components/PropertyBreadcrumb';
import { PropertyHeader } from './components/PropertyHeader';
import { PropertyGalleryMosaic } from './components/PropertyGalleryMosaic';
import { PropertyMobileGallery } from './components/PropertyMobileGallery';
import { PropertyLightbox } from './components/PropertyLightbox';
import { PropertySpecsStrip } from './components/PropertySpecsStrip';
import { PropertyDescription } from './components/PropertyDescription';
import { PropertyCharacteristics } from './components/PropertyCharacteristics';
import { PropertyAmenities } from './components/PropertyAmenities';
import { PropertyBookingCard } from './components/PropertyBookingCard';
import { PropertyAgentCard } from './components/PropertyAgentCard';
import { PropertyVisitDialog } from './components/PropertyVisitDialog';
import { PropertyReservationDialog } from './components/PropertyReservationDialog';
import { PropertyShareDialog } from './components/PropertyShareDialog';
import { PropertyContactMessageDialog } from './components/PropertyContactMessageDialog';
import { useAuth } from '@/context/AuthContext';
import { useChatDraft } from '@/context/ChatDraftContext';
import { usePropertyConversation } from '@/lib/queries/conversations';
import { construireBrouillonBien } from '@/lib/messages/brouillonBien';
import { peutContacterLeBien } from '@/lib/property/contactDuBien';
import { PropertyMobileBottomBar } from './components/PropertyMobileBottomBar';
import { PropertyLocationMap } from './components/PropertyLocationMap';
import { PropertyPriceHistory } from './components/PropertyPriceHistory';
import { PropertyDocuments } from './components/PropertyDocuments';
import { PropertyReviews } from './components/PropertyReviews';
import { PropertyReportButton } from './components/PropertyReportButton';
import { PropertySimilar } from './components/PropertySimilar';
import { PropertyRecentlyViewed } from './components/PropertyRecentlyViewed';

/**
 * Le corps de la fiche — **inchangé**, seulement déplacé (TCK-335, étape 6).
 *
 * Il vivait dans `page.tsx`, qui portait `'use client'` en tête de fichier. `page.tsx` est
 * désormais un composant SERVEUR qui va chercher le bien lui-même et le passe ici en prop : ce
 * composant-ci l'acceptait **déjà** ainsi, si bien que le nombre de composants réellement
 * convertis par l'étape 6 est **zéro**.
 *
 * ⚠️ Il reste délibérément client, et ce n'est pas une concession. Un composant `'use client'`
 * EST rendu en HTML par le serveur Next — l'audit du 2026-08-21 attribuait l'absence de contenu
 * serveur à la directive, à tort. Ce qui manquait, c'était la DONNÉE : elle arrivait par
 * `useEffect` + `apiFetch`, donc après hydratation, donc jamais dans le HTML initial. Elle arrive
 * maintenant en prop. La directive, elle, est indispensable : galerie, lightbox, favoris et cinq
 * dialogues sont de l'état local.
 */
export function PropertyDetailContent({ property }: { readonly property: PropertyDetail }) {
  const favorite = useFavorite(property.id, null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [visitOpen, setVisitOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  /**
   * TCK-500 — « Envoyer un message » ne mène plus au même endroit selon qui clique.
   *
   *   · visiteur anonyme        → le formulaire de piste, sans compte (contact sans friction)
   *   · connecté, ≥ md          → la discussion s'ouvre SUR la fiche, brouillon pré-rempli
   *   · connecté, < md          → la messagerie pleine page, même brouillon
   *   · destinataire = soi-même → pas de bouton du tout
   *
   * La résolution sert aux deux : elle dit s'il faut proposer le bouton, ET ce qu'il ouvre. Elle
   * n'est demandée que pour un utilisateur connecté — la route est `auth:sanctum`, et cette page
   * est massivement vue par des anonymes.
   */
  const { user } = useAuth();
  const chatDraft = useChatDraft();
  const { data: resolutionResponse } = usePropertyConversation(user ? property.slug : null);
  const resolution = resolutionResponse?.data ?? null;

  const tBrouillon = useTranslations('messaging.propertyDraft');
  const brouillon = construireBrouillonBien((cle, valeurs) => tBrouillon(cle, valeurs), property);

  /**
   * TCK-502 — **la personne que la fiche annonce est celle qui recevra.**
   *
   * Le repli sur `owner` couvre le seul cas où `primary_contact` peut manquer : un bien sans
   * propriétaire ni collaborateur `agent`, où le serveur rend `null`. Il ne couvre PAS une
   * clé absente — sur `public.properties.show` elle est toujours émise —, et c'est délibéré :
   * s'il fallait un jour rétablir un repli permanent vers `owner`, ce serait ce défaut-ci qui
   * reviendrait.
   */
  const destinataire = property.primary_contact ?? property.owner;

  const peutContacter = peutContacterLeBien({
    utilisateurId: user?.id ?? null,
    destinataireId: destinataire?.id,
    resolution,
  });

  function ouvrirContact(): void {
    if (user && chatDraft && resolution?.can_message) {
      chatDraft.ouvrirChatBien(resolution);
      return;
    }
    // Repli : anonyme, ou résolution pas encore arrivée, ou page rendue hors du provider.
    setMessageOpen(true);
  }

  useEffect(() => {
    recentlyViewedStorage.push(property.id);
  }, [property.id]);

  const photos = property.photos;
  const pageUrl =
    typeof window !== 'undefined' ? window.location.href : `/properties/${property.slug}`;

  function handleOpenLightbox(index: number): void {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  return (
    <div className="pb-24 lg:pb-12 animate-fade-in-up">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8">
        <PropertyBreadcrumb property={property} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 lg:mt-6">
        <PropertyHeader
          property={property}
          onShare={() => setShareOpen(true)}
          onToggleFavorite={favorite.toggle}
          isFavorite={favorite.isFavorite}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 lg:mt-6">
        <div className="hidden md:block">
          <PropertyGalleryMosaic
            photos={photos}
            title={property.title}
            onOpenLightbox={handleOpenLightbox}
          />
        </div>
        <div className="md:hidden -mx-4">
          <PropertyMobileGallery
            photos={photos}
            title={property.title}
            onOpenLightbox={handleOpenLightbox}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 lg:mt-10 grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-10">
        <div className="space-y-8 min-w-0">
          <PropertySpecsStrip property={property} />
          <PropertyDescription description={property.description} />
          <PropertyCharacteristics property={property} />
          <PropertyAmenities tags={property.tags} />
          <PropertyLocationMap
            latitude={property.location.latitude}
            longitude={property.location.longitude}
            address={formatAddressShort(property.location, { fallback: property.location.full })}
          />
          <PropertyPriceHistory history={property.price_history} />
          <PropertyDocuments documents={property.documents} />
          <PropertyReviews
            slug={property.slug}
            propertyId={property.id}
            averageRating={property.average_rating}
            reviewsCount={property.reviews_count}
            ownerId={property.owner?.id ?? null}
            agencyId={property.agency?.id ?? null}
          />
          <div className="pt-2">
            <PropertyReportButton slug={property.slug} />
          </div>
        </div>

        {/* TCK-505 (#12) — `min-w-0`, comme la colonne principale : sans lui, un enfant de grille
            garde `min-width: auto` et tout contenu plus large que la colonne élargit la page. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 self-start">
          <PropertyBookingCard
            property={property}
            onRequestVisit={() => setVisitOpen(true)}
            onRequestBooking={() => setReservationOpen(true)}
            onMessage={ouvrirContact}
            canMessage={peutContacter}
          />
          <PropertyAgentCard
            contact={destinataire}
            agency={property.agency}
            propertySlug={property.slug}
            propertyTitle={property.title}
            onMessage={ouvrirContact}
            canMessage={peutContacter}
          />
        </aside>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-12">
        <PropertySimilar slug={property.slug} />
        <PropertyRecentlyViewed excludeId={property.id} />
      </div>

      <div className="lg:hidden">
        <PropertyMobileBottomBar
          property={property}
          onRequestVisit={() => setVisitOpen(true)}
          onRequestBooking={() => setReservationOpen(true)}
        />
      </div>

      <PropertyLightbox
        photos={photos}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        startIndex={lightboxIndex}
        title={property.title}
      />
      <PropertyVisitDialog slug={property.slug} open={visitOpen} onOpenChange={setVisitOpen} />
      <PropertyReservationDialog
        property={property}
        open={reservationOpen}
        onOpenChange={setReservationOpen}
      />
      <PropertyShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={property.title}
        url={pageUrl}
      />
      <PropertyContactMessageDialog
        slug={property.slug}
        open={messageOpen}
        onOpenChange={setMessageOpen}
        defaultMessage={brouillon}
      />
    </div>
  );
}
