'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cn } from '@/lib/utils';
import { useBoostProducts, useBuyBoost, useCredits } from './api';
import { manqueDeCredits, type BoostProduct } from './types';

export interface BoostDialogProps {
  readonly propertyId: number;
  readonly propertyTitle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * TCK-633 lot F (ADR-0061 §5, AC14) — choisir une mise en avant. Le solde et le montant manquant
 * sont dits AVANT la confirmation ; il n'y a pas de bouton d'achat de crédits (phase 2, §11).
 */
/** TCK-822 — une clé par ouverture du dialogue ; l'offre choisie la complète (cf. `cleAchat`). */
function nouvelleOuverture(): string {
  return globalThis.crypto.randomUUID();
}

export function BoostDialog({ propertyId, propertyTitle, open, onOpenChange }: BoostDialogProps) {
  const t = useTranslations('boost');
  const router = useRouter();
  const messageErreur = useMessageErreurApi();
  const credits = useCredits(open);
  const offres = useBoostProducts(open);
  const [choix, setChoix] = useState<number | null>(null);
  const [ouverture, setOuverture] = useState(nouvelleOuverture);
  // TCK-822 (P24.01) : la clé naît à l'ouverture et reste la même tant que le dialogue est ouvert,
  // si bien qu'un « Confirmer » repris après une réponse perdue ne débite pas deux fois. Elle porte
  // l'offre : choisir une autre offre est un autre achat, que l'API refuserait sous la même clé.
  const achat = useBuyBoost(propertyId, `${ouverture}-${choix ?? 0}`);
  const [fait, setFait] = useState(false);

  const solde = credits.data?.data.balance ?? 0;
  const liste = offres.data?.data ?? [];
  const offre = liste.find((p) => p.id === choix) ?? null;
  const manque = offre ? Math.max(0, offre.price_credits - solde) : 0;
  const refusSolde = manqueDeCredits(achat.error);

  const libelle = (p: BoostProduct) =>
    p.kind === 'bump'
      ? t('kinds.bump')
      : p.kind === 'featured'
        ? t('kinds.featured', { days: p.duration_days })
        : t(`kinds.badge.${p.variant ?? 'urgent'}`, { days: p.duration_days });

  const fermer = (ouvert: boolean) => {
    if (!ouvert) {
      setChoix(null);
      setFait(false);
      setOuverture(nouvelleOuverture());
      achat.reset();
    }
    onOpenChange(ouvert);
  };

  const confirmer = () => {
    if (!offre || manque > 0) return;
    achat.mutate(
      { product_id: offre.id },
      {
        onSuccess: () => {
          setFait(true);
          router.refresh();
        },
      },
    );
  };

  const chargement = credits.isLoading || offres.isLoading;
  const echec = credits.isError || offres.isError;

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description', { title: propertyTitle })}</DialogDescription>
        </DialogHeader>

        {chargement ? (
          <p className="text-sm text-muted-foreground">{t('dialog.loading')}</p>
        ) : echec ? (
          <ErrorState
            message={t('dialog.loadError')}
            onRetry={() => {
              void credits.refetch();
              void offres.refetch();
            }}
            retryLabel={t('dialog.retry')}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground tabular-nums">{t('dialog.balance', { count: solde })}</p>
            <ul className="space-y-2">
              {liste.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={choix === p.id}
                    onClick={() => setChoix(p.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      choix === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <span className="text-foreground">{libelle(p)}</span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{t('dialog.price', { count: p.price_credits })}</span>
                  </button>
                </li>
              ))}
            </ul>
            {manque > 0 ? (
              <div role="alert" className="space-y-1 text-sm">
                <p className="font-medium text-destructive">{t('dialog.missing', { count: manque })}</p>
                <p className="text-muted-foreground">{t('dialog.noPurchase')}</p>
              </div>
            ) : null}
            {refusSolde ? (
              <p role="alert" className="text-sm font-medium text-destructive">{t('dialog.missing', { count: refusSolde.missing })}</p>
            ) : achat.error ? (
              <p role="alert" className="text-sm text-destructive">{messageErreur(achat.error, t('dialog.failed'))}</p>
            ) : null}
            {fait ? (
              <p role="status" className="text-sm text-success">{t('dialog.done')}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => fermer(false)} disabled={achat.isPending}>
            {t('dialog.cancel')}
          </Button>
          <Button onClick={confirmer} disabled={!offre || manque > 0 || achat.isPending || fait}>
            {achat.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
