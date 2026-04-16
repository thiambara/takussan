'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PhotoGallery } from '@/components/properties/PhotoGallery';
import { PropertySkeleton } from '@/components/properties/PropertySkeleton';
import { useProperty } from '@/hooks/useProperty';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(price);
}

export default function PropertyDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: property, loading, error } = useProperty(slug);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-[2fr_1fr] gap-8">
          <PropertySkeleton />
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-stone-200 rounded w-3/4" />
            <div className="h-6 bg-stone-200 rounded w-1/2" />
            <div className="h-14 bg-stone-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-stone-500">
        <p className="text-lg font-medium">Ce bien est introuvable.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-slate-700 underline underline-offset-4 hover:text-slate-900 transition-colors duration-150"
        >
          ← Retour aux annonces
        </Link>
      </div>
    );
  }

  const photos = property.photos
    ? property.photos.map(p => p.medium)
    : property.main_photo_url
      ? [property.main_photo_url]
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <Link
        href="/"
        className="text-sm text-stone-500 hover:text-slate-700 transition-colors duration-150 mb-6 inline-block"
      >
        ← Retour aux annonces
      </Link>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-10">
        {/* Galerie */}
        <PhotoGallery photos={photos} title={property.title} />

        {/* Infos */}
        <div className="space-y-6">
          <div>
            <p className="text-sm text-stone-500 mb-1">
              {property.type_label} · {property.location.quarter}, {property.location.city}
            </p>
            <h1 className="text-2xl font-bold text-stone-900 leading-snug">
              {property.title}
            </h1>
            <p className="text-3xl font-bold text-slate-800 mt-3">
              {formatPrice(property.price)}
            </p>
          </div>

          {(property.bedrooms || property.bathrooms || property.area) && (
            <div className="grid grid-cols-3 gap-4 py-4 border-y border-stone-200 text-center text-sm">
              {property.bedrooms && (
                <div>
                  <p className="font-semibold text-stone-900">{property.bedrooms}</p>
                  <p className="text-stone-500">Chambres</p>
                </div>
              )}
              {property.bathrooms && (
                <div>
                  <p className="font-semibold text-stone-900">{property.bathrooms}</p>
                  <p className="text-stone-500">SDB</p>
                </div>
              )}
              {property.area && (
                <div>
                  <p className="font-semibold text-stone-900">{property.area} m²</p>
                  <p className="text-stone-500">Surface</p>
                </div>
              )}
            </div>
          )}

          {/* Placeholder bouton WhatsApp — implémenté en MVP-003 (Tâche 7) */}
          <div
            id="whatsapp-button-slot"
            className="h-14 bg-stone-100 rounded-lg flex items-center justify-center text-stone-400 text-sm border-2 border-dashed border-stone-300"
          >
            Bouton WhatsApp (Tâche 7)
          </div>

          {property.description && (
            <div>
              <h2 className="font-semibold text-stone-800 mb-2">Description</h2>
              <p className="text-stone-600 leading-relaxed">{property.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
