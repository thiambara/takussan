'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarOutcomeRequest, RadarOutreach } from '@/types/radar';
import { DeposerReponse } from './DeposerReponse';
import { DialogueIssue } from './DialogueIssue';
import { ReponseVerdict } from './ReponseVerdict';
import { derniereReponse, reponsesRecentesDabord, verificationEnCours } from './reponses';

interface SuiviMessageProps {
  readonly message: RadarOutreach;
  /** Pas de prise à soi, STOP, ou un autre geste en cours : rien ne se dépose ni ne se décide. */
  readonly desactive: boolean;
  readonly depotEnCours: boolean;
  readonly relanceEnCours: boolean;
  readonly sansReponseEnCours: boolean;
  readonly onDeposer: (fichiers: readonly File[]) => Promise<boolean>;
  readonly onIssue: (demande: RadarOutcomeRequest) => Promise<unknown>;
  readonly onRelancer: () => void;
  readonly onSansReponse: () => void;
}

/**
 * TCK-2388 — un message envoyé qui attend son issue : ses réponses (la plus récente d'abord, avec leur verdict), le
 * dépôt d'une nouvelle, le geste qui tranche, et la relance. L'échéance est celle de l'API (`follow_up.due_at`) :
 * ce panneau n'écrit aucun délai.
 *
 * Quand la file propose « sans réponse » (les relances sont épuisées et l'échéance passée), le geste principal
 * devient « Classer sans réponse » et la relance n'est plus offerte.
 */
export function SuiviMessage({
  message,
  desactive,
  depotEnCours,
  relanceEnCours,
  sansReponseEnCours,
  onDeposer,
  onIssue,
  onRelancer,
  onSansReponse,
}: SuiviMessageProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const fmt = useFormatteurs();
  const [dialogue, setDialogue] = useState(false);
  // Lu une fois à l'affichage : « due depuis » ou « prévue le » ne dépend pas de la seconde.
  const [maintenant] = useState(() => Date.now());

  const reponses = reponsesRecentesDabord(message.consents);
  const derniere = derniereReponse(message.consents);
  const enAttente = verificationEnCours(message.consents);
  const suivi = message.follow_up;
  const echeance = suivi?.due_at ?? null;
  const due = echeance !== null && new Date(echeance).getTime() <= maintenant;
  const proposeSansReponse = suivi?.propose_no_answer === true;

  return (
    <article className="space-y-4 rounded-xl border bg-card p-4" data-testid="radar-suivi-message" data-outreach={message.id}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {message.sent_at !== null ? t('awaiting.sentAt', { date: fmt.dateTime(message.sent_at) }) : null}
        </p>
        <span className="text-xs text-muted-foreground uppercase">{message.locale}</span>
      </header>

      <section aria-label={t('reply.heading')} className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t('reply.heading')}</h3>
        {reponses.length === 0 ? <p className="text-sm text-muted-foreground">{t('reply.none')}</p> : null}
        {reponses.map((reponse) => <ReponseVerdict key={reponse.id} reponse={reponse} message={message.message} />)}
        {enAttente ? <p className="text-xs text-muted-foreground">{t('reply.waitVerdict')}</p> : null}
        <DeposerReponse onDeposer={onDeposer} desactive={desactive || enAttente} enCours={depotEnCours} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={proposeSansReponse ? 'outline' : 'default'} disabled={desactive} onClick={() => setDialogue(true)}>
          {t('outcome.open')}
        </Button>
      </div>

      {suivi ? (
        <section aria-label={t('followUp.heading')} className="space-y-2 border-t pt-3" data-testid="radar-suivi-relance">
          <h3 className="text-sm font-semibold text-foreground">{t('followUp.heading')}</h3>
          {echeance !== null ? (
            <p className="text-sm text-foreground">
              {due ? t('followUp.dueSince', { date: fmt.date(echeance) }) : t('followUp.dueOn', { date: fmt.date(echeance) })}
            </p>
          ) : null}
          {proposeSansReponse ? (
            <>
              <p className="text-xs text-muted-foreground">{t('followUp.noAnswerHint')}</p>
              <Button type="button" variant="outline" disabled={desactive || sansReponseEnCours} onClick={onSansReponse}>
                {sansReponseEnCours ? t('followUp.noAnswering') : t('followUp.noAnswer')}
              </Button>
            </>
          ) : due ? (
            <Button type="button" variant="outline" disabled={desactive || relanceEnCours} onClick={onRelancer}>
              {relanceEnCours ? t('followUp.preparing') : t('followUp.prepare')}
            </Button>
          ) : null}
        </section>
      ) : null}

      <DialogueIssue open={dialogue} onOpenChange={setDialogue} reponse={derniere} onConfirmer={async (demande) => {
        await onIssue(demande);
        setDialogue(false);
      }} />
    </article>
  );
}
