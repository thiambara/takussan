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
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { EffetAchat } from './effet-achat';
import type { BoostProduct } from './types';
import { useAchatDeBoost } from './useAchatDeBoost';

export interface BoostDialogProps {
  readonly propertyId: number;
  readonly propertyTitle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * TCK-633 lot F (ADR-0061 §5, AC14) — choisir une mise en avant. Le solde et le montant manquant
 * sont dits AVANT la confirmation ; il n'y a pas de bouton d'achat de crédits (phase 2, §11).
 * TCK-2664 — les règles de l'achat vivent dans `useAchatDeBoost`, partagé avec le parcours de la
 * page Crédits : ce dialogue n'en garde que le rendu.
 */
export function BoostDialog({ propertyId, propertyTitle, open, onOpenChange }: BoostDialogProps) {
  const t = useTranslations('boost');
  const router = useRouter();
  const messageErreur = useMessageErreurApi();
  const f = useFormatteurs();
  const a = useAchatDeBoost({ propertyId, ouvert: open });
  const { achat, solde, offre, manque, refusSolde, effet, choix } = a;
  const liste = a.offres;
  const [fait, setFait] = useState(false);

  const libelle = (p: BoostProduct) =>
    p.kind === 'bump'
      ? t('kinds.bump')
      : p.kind === 'featured'
        ? t('kinds.featured', { days: p.duration_days })
        : t(`kinds.badge.${p.variant ?? 'urgent'}`, { days: p.duration_days });

  const direEffet = (e: NonNullable<EffetAchat>) => {
    switch (e.type) {
      case 'remplaceBadge':
        return e.jusquA
          ? t('dialog.effect.replacesBadge', { badge: t(`dialog.effect.badges.${e.variant}`), date: f.date(e.jusquA) })
          : t('dialog.effect.replacesPausedBadge', { badge: t(`dialog.effect.badges.${e.variant}`) });
      case 'prolongeVedette':
        return e.jusquA
          ? t('dialog.effect.extendsFeatured', { date: f.date(e.jusquA) })
          : t('dialog.effect.extendsPausedFeatured', { days: e.jours });
      case 'remonteeEnDelai':
        return t('dialog.effect.bumpCooldown', { date: f.dateTime(e.aPartirDu) });
    }
  };

  const fermer = (ouvert: boolean) => {
    if (!ouvert) {
      a.reinitialiser();
      setFait(false);
    }
    onOpenChange(ouvert);
  };

  const confirmer = () =>
    a.confirmer(() => {
      setFait(true);
      router.refresh();
    });

  const { chargement, echec } = a;

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
            onRetry={a.relire}
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
                    onClick={() => a.choisir(p.id)}
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
            <div aria-live="polite">
              {effet ? <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{direEffet(effet)}</p> : null}
            </div>
            {manque > 0 ? (
              <div role="alert" className="space-y-1 text-sm">
                <p className="font-medium text-destructive">{t('dialog.missing', { count: manque })}</p>
                <p className="text-muted-foreground">{t('dialog.noPurchase')}</p>
              </div>
            ) : null}
            {/* Un refus `credits.insufficient` se lit dans le manque ci-dessus (le solde du refus fait foi). */}
            {refusSolde ? null : achat.error ? (
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
