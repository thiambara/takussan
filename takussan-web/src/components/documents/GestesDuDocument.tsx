'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Share2, Trash2 } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDejaOuvert } from '@/hooks/useDejaOuvert';
import { useDeleteDocument } from '@/lib/queries/documents';
import { cn } from '@/lib/utils';
import type { Document } from '@/types/document';

import { DocumentShareDialog } from './DocumentShareDialog';

/**
 * TCK-2656 (lot 1) — les gestes d'une pièce sur sa fiche : « Télécharger » (son fichier, URL signée),
 * « Partager » et « Supprimer » (confirmé), aux seuls verdicts de l'API (`abilities.share`,
 * `abilities.delete` de `DocumentPolicy`).
 *
 * Le coffre envoie chaque pièce téléversée sur sa fiche : sans ces gestes, le locataire et le bailleur,
 * qui les avaient sur la ligne de la bibliothèque, les auraient perdus (« Rien ne se perd »). Mêmes
 * libellés et même confirmation que la bibliothèque.
 */
export function GestesDuDocument({ document }: { readonly document: Document }) {
  const t = useTranslations('documents.library');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const supprimer = useDeleteDocument();
  const [partage, setPartage] = useState(false);
  const partageMonte = useDejaOuvert(partage);
  const [confirmer, setConfirmer] = useState(false);
  const [echec, setEchec] = useState(false);

  async function supprimerLaPiece() {
    setEchec(false);
    try {
      await supprimer.mutateAsync({ id: document.id });
      router.push('/app/documents');
    } catch {
      setEchec(true);
    }
  }

  const peutPartager = document.abilities?.share === true;
  const peutSupprimer = document.abilities?.delete === true;
  if (!document.file_url && !peutPartager && !peutSupprimer) return null;

  return (
    <div data-testid="gestes-du-document" className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
      {document.file_url ? (
        <a href={document.file_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), 'flex-1 sm:flex-none')}>
          <Download data-icon="inline-start" aria-hidden="true" />
          {t('download')}
        </a>
      ) : null}
      {peutPartager ? (
        <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => setPartage(true)}>
          <Share2 data-icon="inline-start" aria-hidden="true" />
          {t('share')}
        </Button>
      ) : null}
      {peutSupprimer ? (
        <Button type="button" variant="outline" size="icon" onClick={() => setConfirmer(true)} aria-label={t('delete_aria')}>
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}

      {partageMonte ? <DocumentShareDialog open={partage} onOpenChange={setPartage} document={document} /> : null}

      <Dialog
        open={confirmer}
        onOpenChange={(ouvert) => {
          if (!ouvert && !supprimer.isPending) setConfirmer(false);
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
            <Button type="button" variant="outline" onClick={() => setConfirmer(false)} disabled={supprimer.isPending}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={supprimer.isPending}
              onClick={() => void supprimerLaPiece()}
            >
              {supprimer.isPending ? t('deleting') : tCommon('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
