'use client';
import Image from 'next/image';
import { Grid3x3 } from 'lucide-react';
import type { PropertyPhoto } from '@/types/property';

interface PropertyGalleryMosaicProps {
  photos: PropertyPhoto[];
  title: string;
  onOpenLightbox: (startIndex: number) => void;
}

export function PropertyGalleryMosaic({ photos, title, onOpenLightbox }: PropertyGalleryMosaicProps) {
  if (photos.length === 0) {
    return (
      <div className="aspect-[16/10] rounded-xl bg-stone-100 flex items-center justify-center text-stone-400">
        Aucune photo disponible
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onOpenLightbox(0)}
        className="relative w-full aspect-[16/10] rounded-xl overflow-hidden group"
      >
        <Image
          src={photos[0].preview}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 66vw"
          className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
          priority
        />
      </button>
    );
  }

  const main = photos[0];
  const side = photos.slice(1, 5);

  return (
    <div className="relative">
      <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden aspect-[16/9]">
        <button
          type="button"
          onClick={() => onOpenLightbox(0)}
          className="relative col-span-2 row-span-2 group"
        >
          <Image
            src={main.preview}
            alt={title}
            fill
            sizes="50vw"
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
            priority
          />
        </button>
        {side.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onOpenLightbox(i + 1)}
            className="relative group"
          >
            <Image
              src={photo.preview}
              alt={`${title} - photo ${i + 2}`}
              fill
              sizes="25vw"
              className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          </button>
        ))}
      </div>

      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onOpenLightbox(0)}
          className="absolute bottom-4 right-4 hidden md:inline-flex items-center gap-2 rounded-md bg-white/95 px-4 py-2 text-sm font-medium text-stone-900 shadow-md backdrop-blur hover:bg-white transition-colors"
        >
          <Grid3x3 className="size-4" aria-hidden />
          Voir toutes les photos ({photos.length})
        </button>
      )}
    </div>
  );
}
