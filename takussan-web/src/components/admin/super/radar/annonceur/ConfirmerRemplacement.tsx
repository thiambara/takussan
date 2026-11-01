'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ConfirmerRemplacementProps {
  readonly open: boolean;
  readonly onAnnuler: () => void;
  readonly onConfirmer: () => void;
}

/**
 * TCK-2388 — préparer un message alors qu'un brouillon existe le REMPLACE : l'API supprime le brouillon et ses
 * retouches (`RadarOutreachWorkflow::discardPrepared`). Si ce message est déjà parti sur WhatsApp sans avoir été
 * marqué « J'ai envoyé », le remplacer efface la trace du texte réellement envoyé : on le dit avant de le faire.
 */
export function ConfirmerRemplacement({ open, onAnnuler, onConfirmer }: ConfirmerRemplacementProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.prepare.replace');

  return (
    <Dialog open={open} onOpenChange={(ouvert) => { if (!ouvert) onAnnuler(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onAnnuler}>{t('cancel')}</Button>
          <Button type="button" variant="destructive" onClick={onConfirmer}>{t('confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
