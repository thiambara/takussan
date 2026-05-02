'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PropertyRow } from '@/components/property/cards/PropertyRow';
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

/**
 * Rangée « Vus récemment » — TCK-129.
 * Calque le visuel des autres rangées (PropertyRow), mais sans flèches et avec
 * un CTA destructif « Effacer l'historique » à la place de « Tout voir ».
 */
export function RecentlyViewedCarousel({ excludeId }: RecentlyViewedCarouselProps) {
  const t = useTranslations('recentlyViewed');
  const { items, loading, clear } = useRecentlyViewed(excludeId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // AC6 historique : on cache la rangée tant qu'il y a moins de 2 entrées.
  if (!loading && items.length < 2) return null;

  return (
    <>
      <PropertyRow
        variant="standard"
        eyebrow={t('eyebrow')}
        title={t('title')}
        properties={items}
        loading={loading}
        error={null}
        showArrows={false}
        action={{
          label: t('clearHistory'),
          onClick: () => setConfirmOpen(true),
          variant: 'destructive-link',
        }}
      />

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
    </>
  );
}
