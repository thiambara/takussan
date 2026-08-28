'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PropertyPhoto } from '@/types/property';

interface PropertyMobileGalleryProps {
  photos: PropertyPhoto[];
  title: string;
  onOpenLightbox: (startIndex: number) => void;
}

export function PropertyMobileGallery({ photos, title, onOpenLightbox }: PropertyMobileGalleryProps) {
  const t = useTranslations('property.detail');
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    // Sync initial snap state from the embla instance (external system).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(emblaApi.selectedScrollSnap());
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  if (photos.length === 0) {
    return (
      <div className="aspect-[4/3] bg-stone-100 flex items-center justify-center text-stone-400">
        {t('gallery.noPhoto')}
      </div>
    );
  }

  return (
    <div className="relative md:hidden">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onOpenLightbox(i)}
              className="relative flex-[0_0_100%] aspect-[4/3]"
              aria-label={t('gallery.openPhoto', { index: i + 1 })}
            >
              {/*
                TCK-356 — `full`, pas `preview`. Ce carrousel occupe `100vw` : sur un
                téléphone de 430 px en DPR 3, il demande 1290 px physiques, quand
                `preview` en plafonne 800. C'est la même image sous-résolue que sur la
                mosaïque de bureau, et c'est ici qu'elle touche le plus de visiteurs.
              */}
              <Image
                src={photo.full}
                alt={t('gallery.photoAlt', { title, index: i + 1 })}
                fill
                sizes="100vw"
                className="object-cover"
                priority={i === 0}
              />
            </button>
          ))}
        </div>
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            aria-label={t('gallery.previousPhoto')}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md disabled:opacity-50"
            disabled={selected === 0}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            aria-label={t('gallery.nextPhoto')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md disabled:opacity-50"
            disabled={selected === photos.length - 1}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {selected + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}
