'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { postKycReview } from '@/lib/queries/super-admin';
import { StatusBadge as ConsoleStatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { KycDossier, KycDossierStatus } from '@/types/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { KycEcheance } from './KycEcheance';
import { SharedIdentifiersNotice } from './SharedIdentifiersNotice';

type DocumentType = 'rccm' | 'ninea' | 'director_id';

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const DOCUMENTS: readonly DocumentType[] = ['rccm', 'ninea', 'director_id'];

// TCK-2671 — l'envoi des pièces par l'agence (`KycDocumentUploader`) vit dans `VerificationDeLAgence`.

export function KycDossierTimeline({ dossier }: { dossier: KycDossier }) {
  const t = useTranslations('kyc');
  const fmt = useFormatteurs();
  const steps = [
    { id: 'created', label: t('timeline.steps.created'), date: dossier.created_at },
    { id: 'submitted', label: t('timeline.steps.submitted'), date: dossier.submitted_at },
    {
      id: 'decision',
      label: dossier.status === 'rejected' ? t('timeline.steps.rejection') : t('timeline.steps.decision'),
      date: dossier.reviewed_at,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          {t('timeline.title')}
        </CardTitle>
      </CardHeader>
      {/* `@container` : ce suivi vit en pleine largeur dans `/app/agency/kyc` et dans un panneau
          de ~550 px sur `/super-admin/agencies/[id]` — la grille se règle sur la carte, pas sur l'écran. */}
      <CardContent className="@container space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={dossier.status} />
          <KycEcheance kind="dossier" value={dossier.expires_at} />
          {dossier.rejection_reason ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {t('timeline.reasonAvailable')}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-3 max-lg:@md:grid-cols-3 lg:@min-[25.2rem]:grid-cols-3">
          {steps.map((step) => (
            <div key={step.id} className="rounded-lg bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">{step.label}</p>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">{fmt.dateTime(step.date)}</p>
            </div>
          ))}
        </div>
        {dossier.rejection_reason ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {dossier.rejection_reason}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function KycReviewPanel({ dossier, agencyId }: { dossier: KycDossier; agencyId?: number }) {
  const t = useTranslations('kyc');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const canReview = dossier.status === 'submitted';

  const mutation = useMutation({
    mutationFn: (action: 'verify' | 'reject') => postKycReview(dossier.id, action, reason),
    onSuccess: async (_, action) => {
      toast.add({ title: action === 'verify' ? t('review.toasts.verified') : t('review.toasts.rejected'), type: 'success' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'kyc'] }),
        agencyId ? queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId, 'kyc'] }) : Promise.resolve(),
        agencyId ? queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId] }) : Promise.resolve(),
      ]);
      setReason('');
    },
    onError: (error) => toast.add({ title: t('review.toasts.failed'), description: messageErreur(error, t('errors.generic')), type: 'error' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('review.title')}</CardTitle>
      </CardHeader>
      {/* Panneau de 360-420 px à côté du suivi : trois colonnes y cassaient « Pièce dirigeant », deux laissaient une pièce orpheline — liste empilée tant que la carte fait moins de 36rem. */}
      <CardContent className="@container space-y-4">
        <div className="grid gap-2 max-lg:@xl:grid-cols-3 lg:@min-[32.4rem]:grid-cols-3">
          {DOCUMENTS.map((type) => {
            const piece = dossier.documents.find((doc) => doc.document_type === type);
            const present = piece !== undefined;
            return (
              <div key={type} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{t(`documents.${type}`)}</span>
                  <KycEcheance value={piece?.document_expires_at} />
                </span>
                {present ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" /> : <XCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />}
                <span className="sr-only">{present ? t('uploader.provided') : t('uploader.missing')}</span>
              </div>
            );
          })}
        </div>
        <SharedIdentifiersNotice shared={dossier.shared_identifiers} />
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('review.reasonPlaceholder')}
          aria-label={t('review.reasonPlaceholder')}
          disabled={!canReview || mutation.isPending}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={!canReview || mutation.isPending} onClick={() => mutation.mutate('verify')}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t('review.verify')}
          </Button>
          <Button type="button" variant="destructive" disabled={!canReview || reason.trim().length < 5 || mutation.isPending} onClick={() => mutation.mutate('reject')}>
            <XCircle className="size-4" aria-hidden="true" />
            {t('review.reject')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Le ton de chaque statut de dossier KYC — quatre statuts, quatre tons SÉMANTIQUES.
 *
 * ─── TCK-358 ─ pourquoi cette pastille a changé de forme ───
 *
 * Elle composait ses quatre cas à la main sur `<Badge>`, dont un qui posait le jeton d'accent en
 * aplat et écrivait le texte en BLANC LITTÉRAL (la couleur nommée, écrite en toutes lettres ici
 * parce que la garde lit aussi les commentaires) — exactement la forme que le contrôle B de
 * `check-super-admin-tokens.mjs` refuse, et qui passait parce que ce fichier n'était dans aucun
 * de ses quatre périmètres. Il
 * est pourtant rendu DANS la console super-admin : `admin/super/agency-detail.tsx` (lui, gardé)
 * importe `KycReviewPanel` et `KycDossierTimeline` d'ici. *La garde regardait le fichier qui
 * importe, pas celui qui rend la couleur.*
 *
 * ⚠ `AgencyKycClient` monte lui aussi `KycDossierTimeline`, côté agence : le changement de
 * vocabulaire y vaut également, et c'est voulu — un dossier vérifié ne doit pas se colorer
 * autrement selon qui le regarde.
 *
 * ⚠ `submitted` porte `attention` et NON `info`, et l'écart n'est pas cosmétique — il a existé
 * une demi-journée. TCK-362 réécrivait `admin/super/kyc-queue.tsx` au même moment avec sa propre
 * table (`KYC_STATUS_TONES`), qui donnait `attention` à `submitted` quand celle-ci donnait
 * `info` : **le même statut métier, deux couleurs, dans deux écrans qui se suivent**. Arbitré ici
 * le 2026-08-27, et arbitré sur le SENS, pas sur l'ancienneté :
 *
 *   `attention` = une décision est attendue de l'opérateur.  `info` = c'est décidé, ça suit son
 *   cours, il n'y a rien à faire.
 *
 * Un dossier `submitted` attend une revue : c'est le seul statut de cette table qui appelle un
 * geste. Le même critère donne `pending` → `neutral` (le dossier existe, l'agence ne l'a pas
 * encore envoyé — rien n'est attendu du super-admin). Aucun statut de ce cycle ne relève d'`info`,
 * et laisser un ton inutilisé vaut mieux que de l'employer pour éviter un trou dans la liste.
 *
 * *Deux tables de tons pour un même vocabulaire métier, c'est la palette brute qui revient sous
 * un autre nom* — celle-ci et `KYC_STATUS_TONES` bougent ensemble ou pas du tout.
 */
const STATUS_TONE: Record<KycDossierStatus, StatusTone> = {
  pending: 'neutral',
  submitted: 'attention',
  verified: 'success',
  rejected: 'danger',
};

export function StatusBadge({ status }: { status: KycDossierStatus }) {
  const t = useTranslations('kyc.status');
  return <ConsoleStatusBadge label={t(status)} tone={STATUS_TONE[status]} data-testid={`kyc-status-${status}`} />;
}
