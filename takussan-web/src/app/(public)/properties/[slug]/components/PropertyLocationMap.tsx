'use client';
import { MapPin } from 'lucide-react';

interface PropertyLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  address: string;
}

export function PropertyLocationMap({ latitude, longitude, address }: PropertyLocationMapProps) {
  if (latitude == null || longitude == null) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-stone-900">Emplacement</h2>
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-6 text-sm text-stone-600 flex items-center gap-2">
          <MapPin className="size-4 text-stone-400" aria-hidden />
          <span>{address || 'Adresse non communiquée.'}</span>
        </div>
      </section>
    );
  }

  const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${
    longitude - 0.01
  }%2C${latitude - 0.01}%2C${longitude + 0.01}%2C${latitude + 0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-stone-900">Emplacement</h2>
      {address && (
        <p className="text-sm text-stone-600 flex items-center gap-2">
          <MapPin className="size-4 text-stone-400" aria-hidden />
          {address}
        </p>
      )}
      <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-100 aspect-[16/9]">
        <iframe
          title={`Carte localisation ${address}`}
          src={iframeSrc}
          className="w-full h-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <a
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary hover:underline"
      >
        Voir sur OpenStreetMap
      </a>
    </section>
  );
}
