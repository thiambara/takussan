'use client';
import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import { useProperty } from '@/hooks/useProperty';
import { useFavorite } from '@/hooks/useFavorite';
import { recentlyViewedStorage } from '@/lib/recently-viewed';
import { formatAddressShort } from '@/lib/format/address';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';

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
import { PropertyMobileBottomBar } from './components/PropertyMobileBottomBar';
import { PropertyLocationMap } from './components/PropertyLocationMap';
import { PropertyPriceHistory } from './components/PropertyPriceHistory';
import { PropertyDocuments } from './components/PropertyDocuments';
import { PropertyReviews } from './components/PropertyReviews';
import { PropertyReportButton } from './components/PropertyReportButton';
import { PropertySimilar } from './components/PropertySimilar';
import { PropertyRecentlyViewed } from './components/PropertyRecentlyViewed';

function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 animate-pulse">
      <div className="h-4 bg-stone-200 rounded w-1/3 mb-6" />
      <div className="h-8 bg-stone-200 rounded w-3/4 mb-4" />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-10">
        <div className="space-y-4">
          <div className="aspect-[4/3] bg-stone-200 rounded-xl" />
          <div className="h-24 bg-stone-200 rounded-xl" />
          <div className="h-40 bg-stone-200 rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="h-64 bg-stone-200 rounded-xl" />
          <div className="h-40 bg-stone-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function PropertyDetailContent({ property }: { property: NonNullable<ReturnType<typeof useProperty>['data']> }) {
  const favorite = useFavorite(property.id, null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [visitOpen, setVisitOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

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

        <aside className="space-y-4 lg:sticky lg:top-24 self-start">
          <PropertyBookingCard
            property={property}
            onRequestVisit={() => setVisitOpen(true)}
            onRequestBooking={() => setReservationOpen(true)}
            onMessage={() => setMessageOpen(true)}
          />
          <PropertyAgentCard
            owner={property.owner}
            agency={property.agency}
            propertySlug={property.slug}
            propertyTitle={property.title}
            onMessage={() => setMessageOpen(true)}
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
      />
    </div>
  );
}

export default function PropertyDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: property, loading, error } = useProperty(slug);

  if (error === 'NOT_FOUND') {
    notFound();
  }

  return (
    <>
      <Navbar />
      {/* Spacer : navbar fixed (~65px) + ligne catégories (~68px) */}
      <div className="h-[133px]" />
      {loading || !property ? <PageSkeleton /> : <PropertyDetailContent property={property} />}
      <Footer />
    </>
  );
}
