'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDeleteDocument } from '@/lib/queries/documents';
import type { Document } from '@/types/document';

/**
 * TCK-2656 — « Supprimer ce document », confirmé, au seul verdict de l'API (`abilities.delete`) ;
 * puis retour à « Documents ». Mêmes libellés et même confirmation que la bibliothèque.
 * Ouvert par le lien du bas de la fiche (téléphone) ou par le menu « … » (bureau).
 */
export function SuppressionDuDocument({
  document,
  open,
  onOpenChange,
}: {
  readonly document: Pick<Document, 'id' | 'name'>;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('documents.library');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const suppression = useDeleteDocument();
  const [echec, setEchec] = useState(false);

  async function supprimer() {
    setEchec(false);
    try {
      await suppression.mutateAsync({ id: document.id });
      router.push('/app/documents');
    } catch {
      setEchec(true);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(ouvert) => {
        if (!ouvert && suppression.isPending) return;
        if (!ouvert) setEchec(false);
        onOpenChange(ouvert);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('delete_confirm_title')}</DialogTitle>
          <DialogDescription className="text-pretty">{t('delete_confirm_body', { name: document.name })}</DialogDescription>
        </DialogHeader>
        {echec ? (
          <p role="alert" className="text-ui text-destructive">
            {t('delete_error')}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={suppression.isPending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={suppression.isPending} onClick={() => void supprimer()}>
            {suppression.isPending ? t('deleting') : tCommon('actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
