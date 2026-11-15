'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { EyeOff, Flag, Loader2, MessageSquareReply, Trash2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import {
  LONGUEUR_MAX_DE_LA_REPONSE,
  fetchReviewReports,
  moderateReview,
  replyToReview,
  type ModerationDecision,
  type ModerationReview,
} from '@/lib/queries/reviews-moderation';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODERATION_REASON_CODES, reasonTextRequired, type ModerationReasonCode } from '@/lib/moderation-reasons';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cn } from '@/lib/utils';

import { AvatarDeLAuteur, BlocDuSujet, EtoilesDeLAvis, PuceDeRisque } from './moderation/pieces-de-l-avis';

interface ModerationDetailProps {
  readonly review: ModerationReview;
  /** Après une décision : le message à dire (« Avis publié. »), la file se relit. */
  readonly onModerated: (message?: string) => void;
  /** Super-admin : retirer et ignorer des signalements lui sont réservés (verif-597 M3). */
  readonly platform?: boolean;
  /** Le nom de l'agence qui signe la réponse publique ; `null` s'il n'a pas pu être lu. */
  readonly agencyName?: string | null;
  /** Au téléphone, les gestes principaux vont dans la barre collante du bas. */
  readonly telephone?: boolean;
  /** Bureau à deux colonnes : ↑ et ↓ passent d'un avis au suivant — l'en-tête le dit. */
  readonly raccourcis?: boolean;
}

type PendingDecision = { decision: Exclude<ModerationDecision, 'approve'> } | null;

const AGENCY_SUBJECT = 'App\\Models\\Agency';

/** Une étape de « Publier avec la réponse » qui a échoué : la réponse, ou la publication qui la suit. */
class EchecDEtape extends Error {
  constructor(
    readonly etape: 'reponse' | 'publication' | 'decision',
    readonly cause: unknown,
  ) {
    super(etape);
  }
}

/**
 * TCK-067 → TCK-2673 — le détail d'un avis (maquette `app-moderation` B, `DetailAvis`) : le SUJET
 * (photo, titre, lien vers sa fiche), l'auteur, la note, le texte entier, le risque et les
 * signalements, la réponse publique, puis les gestes — Publier (avec la réponse quand elle est
 * écrite), Masquer ; Supprimer et Ignorer les signalements restent à la plateforme (verif-597 M3).
 * Masquer, supprimer ou ignorer demande un motif codé, confirmé (TCK-597, ADR-0043 § 7).
 */
export function ModerationDetail({
  review,
  onModerated,
  platform = false,
  agencyName = null,
  telephone = false,
  raccourcis = false,
}: ModerationDetailProps) {
  const t = useTranslations('admin.moderation.detail');
  const tFile = useTranslations('admin.moderation.file');
  const tReasons = useTranslations('common.moderationReasons');
  const tCommon = useTranslations('common.actions');
  const { jourMois, dateTime } = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  // TCK-1203 — trancher un avis exige la 2FA d'un profil plateforme (`ReviewController@moderate`).
  const garde = useGardeDoubleFacteur();
  const idReponse = useId();
  const [pending, setPending] = useState<PendingDecision>(null);
  const [reasonCode, setReasonCode] = useState<ModerationReasonCode | ''>('');
  const [reason, setReason] = useState('');
  const [reponse, setReponse] = useState(review.reply_content ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reportedCount = review.reported_count ?? 0;
  const { data: reportsData } = useQuery({
    queryKey: ['reviews-moderation', 'reports', review.id],
    queryFn: () => fetchReviewReports(review.id, token ?? ''),
    enabled: Boolean(token) && reportedCount > 0,
  });

  const reponseNeuve = reponse.trim() !== '' && reponse.trim() !== (review.reply_content ?? '').trim();

  const mutation = useMutation({
    mutationFn: async (payload: { decision: ModerationDecision; reason_code?: ModerationReasonCode; reason?: string; avecReponse?: boolean }) => {
      const { avecReponse, ...decision } = payload;
      if (avecReponse) {
        try {
          await avecGardeDoubleFacteur(() => replyToReview(review.id, reponse.trim(), token ?? ''), garde);
        } catch (err) {
          throw new EchecDEtape('reponse', err);
        }
      }
      try {
        return await avecGardeDoubleFacteur(() => moderateReview(review.id, decision, token ?? ''), garde);
      } catch (err) {
        throw new EchecDEtape(avecReponse ? 'publication' : 'decision', err);
      }
    },
    onSuccess: (_data, payload) => {
      cancelPending();
      onModerated(payload.decision === 'approve' ? tFile('publie') : undefined);
    },
    onError: (err) => {
      const etape = err instanceof EchecDEtape ? err.etape : 'decision';
      const cause = err instanceof EchecDEtape ? err.cause : err;
      const repli = etape === 'reponse' ? tFile('reponseEchec') : etape === 'publication' ? tFile('reponseSansPublication') : tFile('decisionEchec');
      // La réponse enregistrée sans publication : le message le dit tel quel, quelle que soit la cause.
      setErrorMessage(etape === 'publication' ? repli : messageErreur(cause, repli));
    },
  });

  const repondre = useMutation({
    mutationFn: () => avecGardeDoubleFacteur(() => replyToReview(review.id, reponse.trim(), token ?? ''), garde),
    onSuccess: () => {
      setErrorMessage(null);
      onModerated(tFile('reponse.enregistree'));
    },
    onError: (err) => setErrorMessage(messageErreur(err, tFile('reponseEchec'))),
  });

  const occupe = mutation.isPending || repondre.isPending;

  const handleDecision = (decision: ModerationDecision) => {
    setErrorMessage(null);
    if (decision === 'approve') {
      mutation.mutate({ decision, avecReponse: reponseNeuve && review.can_reply === true });
      return;
    }
    setPending({ decision });
  };

  // TCK-597 (ADR-0043 §7) — un motif CODÉ, choisi dans une liste traduite ; le complément libre
  // est facultatif, sauf pour « autre ».
  const confirmPending = () => {
    if (!pending) return;
    if (reasonCode === '') {
      setErrorMessage(t('reasonCodeRequired'));
      return;
    }
    if (reasonTextRequired(reasonCode) && reason.trim().length === 0) {
      setErrorMessage(t('reasonRequired'));
      return;
    }
    mutation.mutate({ decision: pending.decision, reason_code: reasonCode, reason: reason.trim() || undefined });
  };

  function cancelPending() {
    setPending(null);
    setReasonCode('');
    setReason('');
    setErrorMessage(null);
  }

  // verif-597 m1 — l'écran offre ce que l'API acceptera, lu dans `can_moderate` (policy). Quand il
  // n'offre rien, il dit pourquoi : l'avis porte sur l'agence elle-même, il est déjà publié (verif-597
  // M3 : seule la plateforme le retire), ou il relève de la plateforme.
  const decidable = review.can_moderate === true;
  const notice = decidable
    ? null
    : review.reviewable_type === AGENCY_SUBJECT
      ? t('platformOnly')
      : review.status !== 'pending'
        ? t('publishedPlatformOnly')
        : t('platformReserved');
  const reasonOptions = MODERATION_REASON_CODES.map((code) => ({ value: code, label: tReasons(code) }));
  const reports = reportsData?.data ?? [];
  // Une réponse publique se pose sur un avis qui n'est pas rejeté, par qui la policy y autorise.
  const repondable = review.can_reply === true && review.status !== 'rejected';
  const aRisque = review.risk?.level === 'high';
  const auteur = review.author?.name ?? t('anonymous');
  const contexte = review.context_kind ? tFile(`auteur.${review.context_kind}`) : null;

  const publier = (
    <Button onClick={() => handleDecision('approve')} disabled={occupe}>
      {mutation.isPending && !pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {reponseNeuve && repondable ? tFile('publierAvecLaReponse') : tFile('publier')}
    </Button>
  );
  const masquer = (
    <Button variant="outline" onClick={() => handleDecision('hide')} disabled={occupe}>
      <EyeOff className="size-4" aria-hidden="true" />
      {t('hide')}
    </Button>
  );
  const gestesDeLaPlateforme = platform ? (
    <>
      <Button variant="ghost" className="text-destructive" onClick={() => handleDecision('delete')} disabled={occupe}>
        <Trash2 className="size-4" aria-hidden="true" />
        {t('delete')}
      </Button>
      {reportedCount > 0 ? (
        <Button variant="ghost" onClick={() => handleDecision('ignore')} disabled={occupe}>
          <X className="size-4" aria-hidden="true" />
          {t('ignoreReports')}
        </Button>
      ) : null}
    </>
  ) : null;
  const enregistrerLaReponse = (
    <Button onClick={() => repondre.mutate()} disabled={occupe || !reponseNeuve}>
      {repondre.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {tFile('reponse.enregistrer')}
    </Button>
  );

  return (
    <section className="flex min-w-0 flex-col" data-testid="moderation-detail" aria-labelledby={`${idReponse}-titre`}>
      <header className={cn('flex items-center gap-3 border-b border-border px-5 py-3', telephone && 'sr-only')}>
        <h2 id={`${idReponse}-titre`} className="min-w-0 flex-1 text-corps font-semibold">
          {aRisque ? tFile('detailTitre.risque', { id: review.id }) : tFile('detailTitre.autre', { id: review.id })}
        </h2>
        {raccourcis ? (
          <p className="flex flex-none items-center gap-1.5 text-xs text-muted-foreground">
            <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-card px-1 font-sans text-legende font-medium">
              ↑
            </kbd>
            <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-card px-1 font-sans text-legende font-medium">
              ↓
            </kbd>
            {tFile('clavier')}
          </p>
        ) : null}
      </header>

      <div className={cn('space-y-4', telephone ? 'p-4' : 'p-5')}>
        <BlocDuSujet sujet={review.target} />

        <div>
          <div className="flex items-center gap-3">
            <AvatarDeLAuteur avis={review} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-corps font-semibold">{auteur}</p>
              <p className="text-ui text-muted-foreground">
                {[contexte, tFile('auteur.numero', { id: review.id }), jourMois(review.created_at)].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <EtoilesDeLAvis note={review.rating} grand />
            <span className="text-sm font-semibold tabular-nums">{tFile('note', { n: review.rating })}</span>
          </div>
          {review.title ? <p className="mt-2.5 text-corps font-semibold">{review.title}</p> : null}
          <p className="mt-2.5 whitespace-pre-wrap text-corps leading-relaxed">
            {review.content ?? <em className="text-muted-foreground">{t('noComment')}</em>}
          </p>
        </div>

        {review.risk ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-warning/10 px-3 py-2.5" data-slot="risque-de-l-avis">
            <PuceDeRisque avis={review} />
            <span className="inline-flex items-center gap-1 text-ui text-muted-foreground">
              <Flag className="size-3.5" aria-hidden="true" />
              {reportedCount > 0 ? tFile('signalements', { n: reportedCount }) : tFile('aucunSignalement')}
            </span>
          </div>
        ) : null}

        {reports.length > 0 ? (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Flag className="size-4 text-destructive" aria-hidden="true" />
              {t('reportsHeading', { count: String(reports.length) })}
            </h3>
            <ul className="space-y-2">
              {reports.map((report, i) => (
                <li key={`${report.user_id ?? 'anon'}-${i}`} className="rounded-lg border border-border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {/* P193.05 (TCK-2053) — « Anonyme » seulement sans `user_id`. */}
                    <span>{report.user_id === null ? t('anonymous') : (report.user?.name ?? t('reporterFallback'))}</span>
                    {report.reported_at ? <span>{dateTime(report.reported_at)}</span> : null}
                  </div>
                  <p className="mt-1">{report.reason ?? '—'}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {repondable ? (
          <div>
            <label htmlFor={idReponse} className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <MessageSquareReply className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              {tFile('reponse.titre')}
            </label>
            <Textarea
              id={idReponse}
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              rows={4}
              maxLength={LONGUEUR_MAX_DE_LA_REPONSE}
              placeholder={tFile('reponse.placeholder')}
              aria-describedby={`${idReponse}-aide`}
            />
            <p id={`${idReponse}-aide`} className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {agencyName
                ? tFile('reponse.aide', { agence: agencyName, n: reponse.length, max: LONGUEUR_MAX_DE_LA_REPONSE })
                : tFile('reponse.aideSansNom', { n: reponse.length, max: LONGUEUR_MAX_DE_LA_REPONSE })}
            </p>
          </div>
        ) : null}

        {notice !== null ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground" data-testid="moderation-platform-only">
            {notice}
          </p>
        ) : null}

        {pending ? (
          <div className="rounded-lg border border-border bg-muted p-4" data-testid="moderation-confirm">
            <p className="mb-2 text-sm font-semibold">
              {pending.decision === 'delete' ? t('confirmDelete') : pending.decision === 'hide' ? t('confirmHide') : t('confirmIgnore')}
            </p>
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block">{t('reasonCodeLabel')}</span>
              <Select value={reasonCode} onValueChange={(v) => setReasonCode((v as ModerationReasonCode | null) ?? '')} items={reasonOptions}>
                <SelectTrigger className="w-full bg-background" aria-label={t('reasonCodeLabel')}>
                  <SelectValue placeholder={t('reasonCodePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {reasonOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label htmlFor={`${idReponse}-motif`} className="mt-3 block text-xs text-muted-foreground">
              {reasonTextRequired(reasonCode) ? t('reasonLabelRequired') : t('reasonLabel')}
            </label>
            <Textarea
              id={`${idReponse}-motif`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-1"
              placeholder={t('reasonPlaceholder')}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={cancelPending} disabled={mutation.isPending}>
                {tCommon('cancel')}
              </Button>
              <Button variant={pending.decision === 'delete' ? 'destructive' : 'default'} onClick={confirmPending} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {tCommon('confirm')}
              </Button>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {/* Au téléphone, les gestes réservés à la plateforme restent dans le corps : la barre n'en porte que deux. */}
        {telephone && decidable && gestesDeLaPlateforme ? <div className="flex flex-wrap gap-2">{gestesDeLaPlateforme}</div> : null}
        {decidable ? <p className="text-ui text-muted-foreground">{tFile('motifRappel')}</p> : null}
      </div>

      {telephone ? (
        decidable && !pending ? (
          <BarreDAction secondaire="premier">
            {masquer}
            {publier}
          </BarreDAction>
        ) : !decidable && repondable ? (
          <BarreDAction>{enregistrerLaReponse}</BarreDAction>
        ) : null
      ) : decidable ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5">
          {gestesDeLaPlateforme}
          <span className="flex-1" />
          {masquer}
          {publier}
        </div>
      ) : repondable ? (
        <div className="flex justify-end border-t border-border px-5 py-3.5">{enregistrerLaReponse}</div>
      ) : null}
    </section>
  );
}
