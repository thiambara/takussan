'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useSetDocumentVisibility } from '@/lib/queries/documents';

/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12) — la visibilité d'un document de fiche client, à la
 * ligne : la pastille « Interne » et la bascule du personnel. La fiche client et la bibliothèque les
 * montent toutes deux.
 *
 * Rien ici ne juge qui voit quoi : l'API ne sert jamais un document interne au client de la fiche, et
 * ne lui offre jamais `abilities.set_visibility`. Le client ne voit donc ni la pastille ni le geste.
 */

/** La pastille d'un document gardé pour l'agence : ton neutre, pas d'alerte. */
export function PastilleInterne() {
  const t = useTranslations('documents.visibilite');
  return (
    <Badge variant="secondary">
      <Lock aria-hidden="true" />
      {t('interne')}
    </Badge>
  );
}

interface BasculeDeVisibiliteProps {
  readonly documentId: number;
  readonly nom: string;
  readonly interne: boolean;
  /** Après une bascule réussie : p. ex. `router.refresh()` d'une liste rendue côté serveur. */
  readonly onChange?: () => void;
}

/**
 * « Rendre visible au client » (confirmé : c'est le geste irréversible — ce que le client aura
 * téléchargé ne se reprend pas) ou « Garder pour l'agence » (immédiat).
 */
export function BasculeDeVisibilite({ documentId, nom, interne, onChange }: BasculeDeVisibiliteProps) {
  const t = useTranslations('documents.visibilite');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const bascule = useSetDocumentVisibility();
  const [confirmation, setConfirmation] = useState(false);

  const poser = async (is_internal: boolean) => {
    await bascule.mutateAsync({ id: documentId, is_internal });
    setConfirmation(false);
    onChange?.();
  };

  const erreur = bascule.error ? (
    <p role="alert" className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {messageErreur(bascule.error, t('erreur'))}
    </p>
  ) : null;

  if (!interne) {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={bascule.isPending}
          onClick={() => void poser(true).catch(() => undefined)}
        >
          <Lock className="mr-1 size-4" aria-hidden="true" />
          {bascule.isPending ? t('en_cours') : t('garder')}
        </Button>
        {erreur}
      </>
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmation(true)}>
        <Eye className="mr-1 size-4" aria-hidden="true" />
        {t('rendre_visible')}
      </Button>
      <Dialog open={confirmation} onOpenChange={setConfirmation}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('confirmer_titre')}</DialogTitle>
            <DialogDescription>{t('confirmer_corps', { name: nom })}</DialogDescription>
          </DialogHeader>
          {erreur}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmation(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              type="button"
              disabled={bascule.isPending}
              onClick={() => void poser(false).catch(() => undefined)}
            >
              {bascule.isPending ? t('en_cours') : t('confirmer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
