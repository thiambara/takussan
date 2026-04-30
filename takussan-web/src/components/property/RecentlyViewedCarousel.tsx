'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PropertyCard } from '@/components/property/PropertyCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';

interface RecentlyViewedCarouselProps {
  excludeId?: number;
}

function CarouselSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex-none w-56 space-y-3">
          <Skeleton className="aspect-4/3 w-full rounded-xl" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function RecentlyViewedCarousel({ excludeId }: RecentlyViewedCarouselProps) {
  const t = useTranslations('recentlyViewed');
  const { items, loading, clear } = useRecentlyViewed(excludeId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // AC6: hide when fewer than 2 valid entries (nothing useful to display).
  if (!loading && items.length < 2) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
          <Clock className="size-5 text-stone-500" aria-hidden />
          {t('title')}
        </h2>
      </div>

      {loading ? (
        <CarouselSkeleton />
      ) : (
        <div
          className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none -mx-6 px-6 md:mx-0 md:px-0"
          role="list"
          aria-label={t('title')}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              role="listitem"
              className="flex-none w-56 sm:w-64 snap-start"
            >
              <PropertyCard property={item} index={i} />
            </div>
          ))}

          {/* AC7: clear history button at end of carousel */}
          <div className="flex-none flex items-center pl-2 pr-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2 transition-colors whitespace-nowrap"
            >
              {t('clearHistory')}
            </button>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('cancel')}
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                clear();
                setConfirmOpen(false);
              }}
            >
              {t('confirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
