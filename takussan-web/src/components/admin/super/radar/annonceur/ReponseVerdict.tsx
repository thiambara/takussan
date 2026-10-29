'use client';

import { Image as ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarConsent, RadarVerdictClassification } from '@/types/radar';
import { DISCORDANCES_RADAR } from '../codes-radar';
import { discordancesDe, lectureDesClauses } from './reponses';
import { useMotifRadar } from './useMessageEchecAnnonceur';

interface ReponseVerdictProps {
  readonly reponse: RadarConsent;
  /** Le texte du message auquel elle répond : il dit combien de clauses se cherchent. */
  readonly message: string;
}

const TON: Record<RadarVerdictClassification, StatusTone> = {
  consent: 'success',
  refusal: 'neutral',
  stop: 'danger',
  question: 'info',
  ambiguous: 'attention',
};

/**
 * TCK-2388 — une réponse déposée, d'un coup d'œil : la pastille du classement de l'IA et sa confiance ; dessous, ce
 * qui la justifie — le numéro (concordant ou non, et qui l'a jugé), les clauses retrouvées « k sur N », la réponse
 * recopiée, la transcription repliable ; les captures en vignettes (URL signées) ; un échec ou une attente par son motif.
 *
 * **Un verdict n'ouvre rien** : seule la confirmation de l'opérateur rend un accord valide, et cet écran le dit en
 * montrant qui l'a confirmé. La transcription affichée est la colonne de la réponse ; la copie que porte le verdict n'est pas lue.
 */
export function ReponseVerdict({ reponse, message }: ReponseVerdictProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const tOutcome = useTranslations('superAdmin.pages.radar.advertiser.outcome');
  const fmt = useFormatteurs();
  const motif = useMotifRadar();
  const verdict = reponse.verdict;
  // L'API écrit toujours `clauses_found` et `discordances` (`RadarConsentVerdict::from`) : une ligne mal formée ne fait pas
  // tomber la fiche — sans écarts lisibles, le verdict se lit comme « pas de verdict exploitable » (`discordancesDe`).
  const clauses = verdict
    ? lectureDesClauses(Array.isArray(verdict.clauses_found) ? verdict.clauses_found : [], verdict.clauses_complete === true, message)
    : null;
  const ecarts = discordancesDe(reponse);

  const enAttente = reponse.verification_status === 'pending';
  const echec = reponse.verification_status === 'failed';

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-reponse" data-verification={reponse.verification_status}>
      <p className="text-xs text-muted-foreground">{t('reply.depositedAt', { date: fmt.dateTime(reponse.created_at) })}</p>

      {enAttente ? (
        <p role="status" className="text-sm text-foreground" data-testid="radar-reponse-en-cours">
          {reponse.verification_reason ? t('reply.pendingReason', { reason: motif(reponse.verification_reason) }) : t('reply.pending')}
        </p>
      ) : null}
      {echec ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-reponse-echec">
          {reponse.verification_reason
            ? t('reply.failed', { reason: motif(reponse.verification_reason) })
            : t('reply.failedNoReason')}
        </p>
      ) : null}

      {verdict ? (
        <section aria-label={t('reply.verdict.heading')} className="space-y-2" data-testid="radar-verdict">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TON[verdict.classification]} label={t(`reply.verdict.classifications.${verdict.classification}`)} />
            <span className="text-xs text-muted-foreground">{t('reply.verdict.confidence', { level: t(`reply.verdict.levels.${verdict.confidence}`) })}</span>
          </div>
          <ul className="space-y-1 text-sm text-foreground">
            <li data-testid="radar-verdict-numero">
              {verdict.number_matches === true
                ? t('reply.verdict.numberMatches')
                : verdict.number_matches === false
                  ? (verdict.counterpart_phone
                    ? t('reply.verdict.numberMismatch', { phone: verdict.counterpart_phone })
                    : t('reply.verdict.numberMismatchUnknown'))
                  : t('reply.verdict.numberUnreadable')}
              {verdict.number_matches !== null ? (
                <span className="text-xs text-muted-foreground"> ({t(verdict.number_checked_by === 'code' ? 'reply.verdict.checkedByCode' : 'reply.verdict.checkedByModel')})</span>
              ) : null}
            </li>
            <li data-testid="radar-verdict-clauses">
              {clauses?.total != null
                ? t('reply.verdict.clauses', { found: clauses.trouvees, total: clauses.total })
                : t('reply.verdict.clausesIncomplete', { found: clauses?.trouvees ?? 0 })}
              {clauses && clauses.manquantes.length > 0 ? (
                <span className="text-xs text-muted-foreground"> ({t('reply.verdict.clausesMissing', { missing: clauses.manquantes.join(', ') })})</span>
              ) : null}
            </li>
            {verdict.counterpart_name ? <li>{t('reply.verdict.counterpart', { name: verdict.counterpart_name })}</li> : null}
          </ul>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">{t('reply.verdict.replyText')}</p>
            {verdict.reply_text ? (
              <q className="block rounded-md bg-muted px-3 py-2 text-sm text-foreground" data-testid="radar-verdict-reponse">{verdict.reply_text}</q>
            ) : (
              <p className="text-sm text-muted-foreground">{t('reply.verdict.noReplyText')}</p>
            )}
          </div>
          {ecarts.length > 0 ? (
            <div className="rounded-lg border border-warning/60 bg-warning/5 p-3" data-testid="radar-verdict-ecarts">
              <p className="text-xs font-medium text-foreground">{t('reply.verdict.discordances')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                {ecarts.map((code) => (
                  <li key={code}>{DISCORDANCES_RADAR[code] ? tOutcome(`discordances.${DISCORDANCES_RADAR[code]}`) : code}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {t('reply.verdict.transcript')}
        </summary>
        {reponse.transcript ? (
          <pre className="mt-2 rounded-md bg-muted p-3 font-sans text-sm whitespace-pre-wrap text-foreground">{reponse.transcript}</pre>
        ) : (
          <p className="mt-2 text-muted-foreground">{t('reply.verdict.noTranscript')}</p>
        )}
      </details>

      {reponse.captures.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('reply.captures')}</p>
          <ul className="flex flex-wrap gap-2">
            {reponse.captures.map((capture, i) => (
              <li key={capture.id}>
                {/* Une <img> simple : l'URL est signée et expire, next/image la mettrait en cache d'optimiseur. */}
                <a href={capture.url} target="_blank" rel="noopener noreferrer" className="block rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capture.url}
                    alt={t('reply.captureAlt', { n: i + 1 })}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="h-24 w-auto max-w-40 rounded-md object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      )}

      {reponse.confirmed_at !== null ? (
        <p className="text-sm text-foreground" data-testid="radar-reponse-confirmee">
          {t('reply.verdict.confirmed', {
            name: reponse.confirmed_by?.name ?? '—',
            date: fmt.dateTime(reponse.confirmed_at),
          })}
          {reponse.confirmation_reason ? <span className="block text-xs text-muted-foreground">{t('reply.verdict.confirmationReason', { reason: reponse.confirmation_reason })}</span> : null}
        </p>
      ) : null}
      {reponse.revoked_at !== null ? (
        <p className="text-sm text-destructive">{t('reply.verdict.revoked', { date: fmt.dateTime(reponse.revoked_at) })}</p>
      ) : null}
    </article>
  );
}
