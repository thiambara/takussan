'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchRadarActivationReminder, markRadarActivationReminderSent, radarKeys } from '@/lib/queries/radar';
import { cn } from '@/lib/utils';
import { RADAR_MESSAGE_LOCALES, type RadarActivationReminderResponse, type RadarMessageLocale } from '@/types/radar';
import { useLibelleCodePublication, useMessageEchecAnnonceur } from './useMessageEchecAnnonceur';

/** Le code de l'intervalle minimal : l'aperçu porte la date où la prochaine relance devient possible. */
const TROP_TOT = 'radar.activation.too_soon';

interface RelanceActivationProps {
  readonly advertiserId: number;
  /** La prise en charge est à l'opérateur : marquer envoyée l'exige (409 sinon). */
  readonly mienne: boolean;
  /** Un autre geste de la fiche est en cours, ou l'annonceur a dit STOP. */
  readonly desactive: boolean;
}

/**
 * TCK-2394 (ADR-0077, lot 4) — la relance d'activation : le compte créé par « Publier pour lui » n'est pas encore activé,
 * et l'annonceur reçoit ce que ses annonces lui rapportent — les chiffres réels de la période, que l'API compte et met
 * dans un texte fixe versionné. Le panneau ne se montre que si le Radar a créé un compte (`state` = `activation`). Il dit
 * ce qui bloque ; sans blocage, il ouvre WhatsApp, puis l'opérateur marque la relance envoyée — l'API rejuge tout sous
 * verrou et journalise les chiffres cités.
 */
export function RelanceActivation({ advertiserId, mienne, desactive }: RelanceActivationProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.activation');
  const fmt = useFormatteurs();
  const libelle = useLibelleCodePublication();
  const messageEchec = useMessageEchecAnnonceur();
  const queryClient = useQueryClient();
  const nom = useId();
  const [locale, setLocale] = useState<RadarMessageLocale>('fr');
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoyee, setEnvoyee] = useState(false);

  const cle = radarKeys.activation(advertiserId, locale);
  const relance = useQuery<RadarActivationReminderResponse, ApiError>({
    queryKey: cle,
    queryFn: () => fetchRadarActivationReminder(advertiserId, locale),
    staleTime: 10_000,
  });
  const envoi = useMutation<RadarActivationReminderResponse, ApiError, RadarMessageLocale>({
    mutationFn: (langue) => markRadarActivationReminderSent(advertiserId, langue),
    onSuccess: (reponse) => {
      setEnvoyee(true);
      queryClient.setQueryData(cle, reponse);
      // Les chiffres de l'autre langue datent d'avant l'envoi : la période a changé.
      return queryClient.invalidateQueries({ queryKey: [...radarKeys.advertiser(advertiserId), 'activation'] });
    },
    onError: (e) => {
      setErreur(e);
      // Un refus dit que l'aperçu n'est plus juste (STOP, activation, autre relance arrivés depuis) : il se relit.
      if (e instanceof ApiError && (e.status === 409 || e.status === 422)) void relance.refetch();
    },
  });

  if (relance.isError) {
    return (
      <ErrorState
        message={`${t('loadError')} ${messageEchec(relance.error)}`}
        onRetry={() => void relance.refetch()}
        retryLabel={t('retry')}
      />
    );
  }
  const apercu = relance.data?.data;
  // Rien à relancer (aucun compte créé par le Radar), ou pas encore lu : le panneau ne prend pas de place.
  if (!apercu || apercu.state !== 'activation') return null;

  const chiffres = apercu.figures;
  const tropTot = apercu.blocking.includes(TROP_TOT) && apercu.available_at !== null;

  return (
    <section aria-label={t('heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-annonceur-activation">
      <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <p className="text-sm text-foreground" data-testid="radar-activation-relances">
        {t('reminders', { count: apercu.reminders.count, date: fmt.dateTime(apercu.reminders.last_at) })}
      </p>

      {chiffres ? (
        <div className="space-y-2" data-testid="radar-activation-chiffres">
          <p className="text-xs text-muted-foreground">{t('period', { since: fmt.dateTime(chiffres.since), until: fmt.dateTime(chiffres.until) })}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t('views')}</dt>
              <dd className="font-medium tabular-nums text-foreground">{fmt.nombre(chiffres.views)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('contacts')}</dt>
              <dd className="font-medium tabular-nums text-foreground">{fmt.nombre(chiffres.contact_requests)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('visits')}</dt>
              <dd className="font-medium tabular-nums text-foreground">{fmt.nombre(chiffres.visit_requests)}</dd>
            </div>
            {chiffres.welcome_credits > 0 ? (
              <div>
                <dt className="text-muted-foreground">{t('credits')}</dt>
                <dd className="font-medium tabular-nums text-foreground">{fmt.nombre(chiffres.welcome_credits)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('figuresCaption')}</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 font-medium">{t('property')}</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">{t('views')}</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">{t('contacts')}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t('visits')}</th>
                </tr>
              </thead>
              <tbody>
                {chiffres.properties.map((bien) => (
                  <tr key={bien.id} className="border-t">
                    <td className="py-1.5 pr-3">
                      <a
                        href={bien.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {bien.title || t('untitled', { id: bien.id })}
                      </a>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.nombre(bien.views)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.nombre(bien.contact_requests)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt.nombre(bien.visit_requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {apercu.blocking.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="radar-activation-blocage">
          <p className="font-medium">{t('blocking')}</p>
          <ul className="list-inside list-disc">
            {apercu.blocking.map((code) => <li key={code}>{libelle(code)}</li>)}
          </ul>
          {tropTot ? <p>{t('availableAt', { date: fmt.dateTime(apercu.available_at) })}</p> : null}
        </div>
      ) : null}

      {apercu.text !== null && apercu.wa_me !== null ? (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('locale')}</legend>
            <div className="flex flex-wrap gap-2">
              {RADAR_MESSAGE_LOCALES.map((code) => (
                <label
                  key={code}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  )}
                >
                  <input
                    type="radio"
                    name={nom}
                    value={code}
                    checked={locale === code}
                    onChange={() => { setLocale(code); setErreur(null); setEnvoyee(false); }}
                    className="accent-primary"
                  />
                  {t(`locales.${code}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <pre
            className="max-h-80 overflow-auto rounded-md bg-muted px-3 py-2 font-sans text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground"
            data-testid="radar-activation-texte"
          >
            {apercu.text}
          </pre>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={apercu.wa_me}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t('whatsapp')}
            </a>
            <Button
              type="button"
              size="sm"
              disabled={!mienne || desactive || envoi.isPending}
              onClick={() => { setErreur(null); setEnvoyee(false); envoi.mutate(locale); }}
            >
              {envoi.isPending ? t('marking') : t('markSent')}
            </Button>
            {!mienne ? <p className="text-xs text-muted-foreground">{t('claimHint')}</p> : null}
          </div>
        </>
      ) : null}

      {envoyee ? <p role="status" className="text-sm text-muted-foreground">{t('sent')}</p> : null}
      {erreur ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-activation-erreur">
          {messageEchec(erreur)}
        </p>
      ) : null}
    </section>
  );
}
