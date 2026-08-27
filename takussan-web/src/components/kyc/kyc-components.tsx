'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileText, Send, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { postKycReview } from '@/lib/queries/super-admin';
import { submitAgencyKyc, uploadAgencyKycDocument } from '@/lib/queries/kyc';
import { StatusBadge as ConsoleStatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import type { KycDossier, KycDossierStatus } from '@/types/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

type DocumentType = 'rccm' | 'ninea' | 'director_id';

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const DOCUMENTS: readonly DocumentType[] = ['rccm', 'ninea', 'director_id'];

export function KycDossierTimeline({ dossier }: { dossier: KycDossier }) {
  const t = useTranslations('kyc');
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
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={dossier.status} />
          {dossier.rejection_reason ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {t('timeline.reasonAvailable')}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">{step.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{formatDate(step.date)}</p>
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

export function KycDocumentUploader({ agencyId, dossier }: { agencyId: number; dossier: KycDossier }) {
  const t = useTranslations('kyc');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const locked = dossier.status === 'verified';
  const documentsByType = useMemo(
    () => new Map(dossier.documents.map((doc) => [doc.document_type, doc])),
    [dossier.documents],
  );

  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: DocumentType; file: File }) => uploadAgencyKycDocument(agencyId, type, file),
    onSuccess: async () => {
      toast.add({ title: t('uploader.toasts.documentAdded'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['agency', agencyId, 'kyc'] });
    },
    onError: (error) => toast.add({ title: t('uploader.toasts.uploadFailed'), description: messageErreur(error, t('errors.generic')), type: 'error' }),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitAgencyKyc(agencyId),
    onSuccess: async () => {
      toast.add({ title: t('uploader.toasts.submitted'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['agency', agencyId, 'kyc'] });
    },
    onError: (error) => toast.add({ title: t('uploader.toasts.submitFailed'), description: messageErreur(error, t('errors.generic')), type: 'error' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('uploader.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {DOCUMENTS.map((type) => {
          const uploaded = documentsByType.get(type);
          return (
            <div key={type} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{t(`documents.${type}`)}</p>
                  {uploaded ? <Badge variant="secondary">{t('uploader.provided')}</Badge> : <Badge variant="outline">{t('uploader.missing')}</Badge>}
                </div>
                {uploaded ? (
                  <a className="mt-1 inline-flex items-center text-sm text-primary hover:underline" href={uploaded.signed_url} target="_blank" rel="noreferrer">
                    <FileText className="mr-1 size-4" aria-hidden="true" />
                    {uploaded.file_name}
                    <ExternalLink className="ml-1 size-3" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={locked || uploadMutation.isPending}
                  onChange={(event) => setFiles((current) => ({ ...current, [type]: event.target.files?.[0] }))}
                  className="md:w-64"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked || !files[type] || uploadMutation.isPending}
                  onClick={() => {
                    const file = files[type];
                    if (file) uploadMutation.mutate({ type, file });
                  }}
                >
                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  {t('uploader.add')}
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={locked || dossier.status === 'submitted' || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="mr-2 size-4" aria-hidden="true" />
            {t('uploader.submit')}
          </Button>
        </div>
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
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {DOCUMENTS.map((type) => {
            const present = dossier.documents.some((doc) => doc.document_type === type);
            return (
              <div key={type} className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-medium">{t(`documents.${type}`)}</span>
                {present ? <CheckCircle2 className="size-5 text-accent" aria-hidden="true" /> : <XCircle className="size-5 text-destructive" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('review.reasonPlaceholder')}
          disabled={!canReview || mutation.isPending}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={!canReview || mutation.isPending} onClick={() => mutation.mutate('verify')}>
            <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
            {t('review.verify')}
          </Button>
          <Button type="button" variant="destructive" disabled={!canReview || reason.trim().length < 5 || mutation.isPending} onClick={() => mutation.mutate('reject')}>
            <XCircle className="mr-2 size-4" aria-hidden="true" />
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

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

