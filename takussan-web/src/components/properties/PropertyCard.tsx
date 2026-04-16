import Image from 'next/image';
import Link from 'next/link';
import type { PropertyListItem } from '@/types/property';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(price);
}

export function PropertyCard({ property }: { property: PropertyListItem }) {
  const photo = property.main_photo_url
    ?? 'https://placehold.co/800x533/e7e5e4/a8a29e?text=Photo+%C3%A0+venir';

  return (
    <Link href={`/properties/${property.slug}`} className="group block">
      <article className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-150">
        <div className="relative aspect-[4/3] bg-stone-200">
          <Image
            src={photo}
            alt={property.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {property.featured && (
            <span className="absolute top-3 left-3 bg-slate-700 text-white text-xs font-medium px-2 py-1 rounded-full">
              À la une
            </span>
          )}
        </div>

        <div className="p-4">
          <p className="text-xs text-stone-500 mb-1">
            {property.type_label} · {property.location.quarter}
          </p>
          <h2 className="font-semibold text-stone-900 leading-snug mb-2 line-clamp-2 group-hover:text-slate-700 transition-colors duration-150">
            {property.title}
          </h2>

          <div className="flex items-center gap-3 text-sm text-stone-600 mb-3">
            {property.bedrooms && <span>{property.bedrooms} ch.</span>}
            {property.area && <span>{property.area} m²</span>}
          </div>

          <p className="text-lg font-bold text-slate-800">
            {formatPrice(property.price)}
          </p>
        </div>
      </article>
    </Link>
  );
}
