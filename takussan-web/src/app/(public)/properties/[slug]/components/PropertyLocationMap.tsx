'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const PropertyLocationMapInner = dynamic(
  () => import('./PropertyLocationMapInner').then((m) => m.PropertyLocationMapInner),
  { ssr: false, loading: () => <Skeleton className="h-[350px] w-full rounded-xl" /> },
);

interface PropertyLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  address: string;
}

export function PropertyLocationMap({ latitude, longitude, address }: PropertyLocationMapProps) {
  const t = useTranslations('property.detail');

  if (latitude == null || longitude == null) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-stone-900">{t('location')}</h2>
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600 flex items-center gap-2">
          <MapPin className="size-4 text-stone-400" aria-hidden />
          <span>{address || t('addressHidden')}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-stone-900">{t('location')}</h2>
      {address && (
        <p className="text-sm text-stone-600 flex items-center gap-2">
          <MapPin className="size-4 text-stone-400" aria-hidden />
          {address}
        </p>
      )}
      <PropertyLocationMapInner latitude={latitude} longitude={longitude} />
      <a
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary hover:underline"
      >
        {t('viewOnOsm')}
      </a>
    </section>
  );
}
