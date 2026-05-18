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

  // TCK-181 — masquer la rangée uniquement si le localStorage est vide ; on
  // accepte de rendre la section même avec un seul item visité.
  if (!loading && items.length < 1) return null;

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
