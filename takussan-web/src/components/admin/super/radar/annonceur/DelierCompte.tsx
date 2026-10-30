'use client';

import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApiError } from '@/lib/api';
import { releaseRadarAdvertiserAccount } from '@/lib/queries/radar';
import { RADAR_ACCOUNT_RELEASE_REASON_MAX, type RadarAccountReleaseResponse } from '@/types/radar';
import { useMessageEchecAnnonceur } from './useMessageEchecAnnonceur';

interface DelierCompteProps {
  readonly annonceurId: number;
  /** La fiche se relit : le compte délié n'y figure plus. */
  readonly onDelie: () => Promise<unknown> | void;
}

/**
 * TCK-2413 (ADR-0077 §3, §11) — le compte que le Radar avait créé pour l'annonceur est supprimé : tant qu'il y reste lié,
 * la réclamation renvoie au support. Le `super_admin` le délie, avec un motif facultatif (journalisé). Offert par la fiche
 * seulement quand l'API le dit (`account.releasable`) ; l'API rejuge (409) un STOP ou une révocation survenus depuis.
 */
export function DelierCompte({ annonceurId, onDelie }: DelierCompteProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.account');
  const messageEchec = useMessageEchecAnnonceur();
  const champMotif = useId();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');

  const geste = useMutation<RadarAccountReleaseResponse, ApiError, string>({
    mutationFn: (raison) => releaseRadarAdvertiserAccount(annonceurId, raison),
    onSuccess: () => {
      setOuvert(false);
      return onDelie();
    },
  });

  const fermer = () => {
    if (geste.isPending) return;
    setOuvert(false);
    geste.reset();
  };

  return (
    <section
      aria-label={t('heading')}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/60 bg-warning/5 px-4 py-3 text-sm"
      data-testid="radar-annonceur-compte-supprime"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-foreground">{t('heading')}</p>
        <p className="text-muted-foreground text-pretty">{t('body')}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => { setMotif(''); setOuvert(true); }}>
        {t('cta')}
      </Button>

      <Dialog open={ouvert} onOpenChange={(etat) => { if (!etat) fermer(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={champMotif}>{t('reasonLabel')}</Label>
            <Textarea id={champMotif} value={motif} maxLength={RADAR_ACCOUNT_RELEASE_REASON_MAX} onChange={(event) => setMotif(event.target.value)} />
          </div>
          {geste.isError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-delier-erreur">
              {messageEchec(geste.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={geste.isPending} onClick={fermer}>{t('cancel')}</Button>
            <Button type="button" disabled={geste.isPending} onClick={() => geste.mutate(motif)} data-testid="radar-delier-confirmer">
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
