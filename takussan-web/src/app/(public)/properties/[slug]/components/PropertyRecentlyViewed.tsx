'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { formatCurrency } from '@/lib/format/currency';

interface PropertyRecentlyViewedProps {
  excludeId: number;
}

// TCK-078 — shared formatter (XOF default until TCK-084 introduces i18n).
function formatPrice(price: number, currency: string): string {
  return formatCurrency(price, currency || 'XOF');
}

export function PropertyRecentlyViewed({ excludeId }: PropertyRecentlyViewedProps) {
  const { items } = useRecentlyViewed(excludeId);
  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
        <Clock className="size-5 text-stone-500" aria-hidden />
        Récemment consultés
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.slice(0, 4).map((item) => (
          <Link
            key={item.id}
            href={`/properties/${item.slug}`}
            className="group rounded-xl overflow-hidden border border-stone-200 hover:shadow-md transition-shadow bg-white"
          >
            <div className="relative aspect-[4/3] bg-stone-100">
              {item.main_photo_url ? (
                <Image
                  src={item.main_photo_url}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-stone-400 text-xs">
                  Pas de photo
                </div>
              )}
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-medium text-stone-900 line-clamp-1">{item.title}</p>
              <p className="text-sm font-semibold text-primary">
                {formatPrice(item.price, item.currency)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
