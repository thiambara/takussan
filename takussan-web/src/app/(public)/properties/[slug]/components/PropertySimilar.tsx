'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PropertyCard } from '@/components/property/PropertyCard';
import { useSimilarProperties } from '@/hooks/useSimilarProperties';

interface PropertySimilarProps {
  slug: string;
}

export function PropertySimilar({ slug }: PropertySimilarProps) {
  const t = useTranslations('property.detail');
  const { data, loading } = useSimilarProperties(slug);
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', slidesToScroll: 1 });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    // Sync initial scroll bounds from embla (external system) on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-stone-900">{t('similar')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[4/5] rounded-xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (data.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-stone-900">{t('similar')}</h2>
        <div className="hidden sm:flex gap-2">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canPrev}
            aria-label={t('previous')}
            className="rounded-full border border-stone-300 bg-white size-9 inline-flex items-center justify-center hover:bg-stone-50 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canNext}
            aria-label={t('next')}
            className="rounded-full border border-stone-300 bg-white size-9 inline-flex items-center justify-center hover:bg-stone-50 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {data.map((property) => (
            <div
              key={property.id}
              className="flex-[0_0_85%] sm:flex-[0_0_48%] lg:flex-[0_0_24%] min-w-0"
            >
              <PropertyCard property={property} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
