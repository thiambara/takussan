'use client';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Grid3x3 } from 'lucide-react';
import type { PropertyPhoto } from '@/types/property';

interface PropertyGalleryMosaicProps {
  photos: PropertyPhoto[];
  title: string;
  onOpenLightbox: (startIndex: number) => void;
}

interface TileProps {
  photo: PropertyPhoto;
  alt: string;
  index: number;
  sizes: string;
  priority?: boolean;
  className?: string;
  onOpen: (index: number) => void;
}

function Tile({ photo, alt, index, sizes, priority, className, onOpen }: TileProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className={`relative group overflow-hidden ${className ?? ''}`}
    >
      <Image
        src={photo.preview}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
      />
    </button>
  );
}

export function PropertyGalleryMosaic({ photos, title, onOpenLightbox }: PropertyGalleryMosaicProps) {
  const t = useTranslations('property.detail');

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/7] rounded-xl bg-stone-100 flex items-center justify-center text-stone-400">
        {t('gallery.noPhotoAvailable')}
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <Tile
        photo={photos[0]}
        alt={title}
        index={0}
        sizes="(max-width: 768px) 100vw, 66vw"
        priority
        onOpen={onOpenLightbox}
        className="w-full aspect-[16/7] rounded-xl"
      />
    );
  }

  // Helper alt builder.
  const altOf = (i: number) => (i === 0 ? title : `${title} - photo ${i + 1}`);

  return (
    <div className="relative">
      <div
        className={`hidden md:grid gap-2 aspect-[160/63] ${
          photos.length === 2
            ? 'grid-cols-[60fr_40fr]'
            : 'grid-cols-4 grid-rows-2'
        }`}
      >
        {photos.length === 2 && (
          <>
            <Tile photo={photos[0]} alt={altOf(0)} index={0} sizes="60vw" priority onOpen={onOpenLightbox} className="rounded-l-xl" />
            <Tile photo={photos[1]} alt={altOf(1)} index={1} sizes="40vw" onOpen={onOpenLightbox} className="rounded-r-xl" />
          </>
        )}

        {photos.length === 3 && (
          <>
            <Tile
              photo={photos[0]}
              alt={altOf(0)}
              index={0}
              sizes="50vw"
              priority
              onOpen={onOpenLightbox}
              className="col-span-2 row-span-2 rounded-l-xl"
            />
            <Tile
              photo={photos[1]}
              alt={altOf(1)}
              index={1}
              sizes="50vw"
              onOpen={onOpenLightbox}
              className="col-span-2 rounded-tr-xl"
            />
            <Tile
              photo={photos[2]}
              alt={altOf(2)}
              index={2}
              sizes="50vw"
              onOpen={onOpenLightbox}
              className="col-span-2 rounded-br-xl"
            />
          </>
        )}

        {photos.length === 4 && (
          <>
            <Tile
              photo={photos[0]}
              alt={altOf(0)}
              index={0}
              sizes="50vw"
              priority
              onOpen={onOpenLightbox}
              className="col-span-2 row-span-2 rounded-l-xl"
            />
            <Tile
              photo={photos[1]}
              alt={altOf(1)}
              index={1}
              sizes="50vw"
              onOpen={onOpenLightbox}
              className="col-span-2 rounded-tr-xl"
            />
            <Tile photo={photos[2]} alt={altOf(2)} index={2} sizes="25vw" onOpen={onOpenLightbox} />
            <Tile photo={photos[3]} alt={altOf(3)} index={3} sizes="25vw" onOpen={onOpenLightbox} className="rounded-br-xl" />
          </>
        )}

        {photos.length >= 5 && (
          <>
            <Tile
              photo={photos[0]}
              alt={altOf(0)}
              index={0}
              sizes="50vw"
              priority
              onOpen={onOpenLightbox}
              className="col-span-2 row-span-2 rounded-l-xl"
            />
            <Tile photo={photos[1]} alt={altOf(1)} index={1} sizes="25vw" onOpen={onOpenLightbox} />
            <Tile photo={photos[2]} alt={altOf(2)} index={2} sizes="25vw" onOpen={onOpenLightbox} className="rounded-tr-xl" />
            <Tile photo={photos[3]} alt={altOf(3)} index={3} sizes="25vw" onOpen={onOpenLightbox} />
            <Tile photo={photos[4]} alt={altOf(4)} index={4} sizes="25vw" onOpen={onOpenLightbox} className="rounded-br-xl" />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpenLightbox(0)}
        className="absolute bottom-4 right-4 hidden md:inline-flex items-center gap-2 rounded-md bg-white/95 px-4 py-2 text-sm font-medium text-stone-900 shadow-md backdrop-blur hover:bg-white transition-colors"
      >
        <Grid3x3 className="size-4" aria-hidden />
        {t('gallery.viewAll', { count: photos.length })}
      </button>
    </div>
  );
}
