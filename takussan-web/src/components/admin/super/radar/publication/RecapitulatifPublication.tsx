'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { nomAffichable } from '@/lib/identite';
import { fetchRadarPublishedMessage, radarKeys } from '@/lib/queries/radar';
import { RADAR_MESSAGE_LOCALES, type RadarMessageLocale, type RadarPublication, type RadarPublishedMessageResponse, type RadarPublishedProperty } from '@/types/radar';
import type { ApiError } from '@/lib/api';
import { useMessageEchecAnnonceur } from '../annonceur/useMessageEchecAnnonceur';

interface LiensPublicsProps {
  readonly biens: readonly Pick<RadarPublishedProperty, 'id' | 'title' | 'public_url'>[];
}

/** Les adresses publiques des biens publiés : chacune s'ouvre à part, et s'écrit en clair pour qui veut la recopier. */
export function LiensPublics({ biens }: LiensPublicsProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.recap');

  return (
    <ul className="space-y-1.5" aria-label={t('links')}>
      {biens.map((bien) => (
        <li key={bien.id} className="flex flex-wrap items-center gap-2 text-sm">
          <a
            href={bien.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {bien.title || t('untitled', { id: bien.id })}
          </a>
          <span className="break-all text-xs text-muted-foreground">{bien.public_url}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Le second message, « vos annonces sont en ligne » : le texte fixe versionné que l'API compose pour TOUS les biens que le
 * Radar a publiés pour l'annonceur, son lien WhatsApp et la copie. Il ne dépend pas de la réponse d'un `publish` : le
 * récapitulatif et la section « déjà en ligne » le lisent de la même façon. Le français par défaut ; la langue se change.
 */
export function SecondMessage({ advertiserId, sousMandat = false }: { readonly advertiserId: number; readonly sousMandat?: boolean }) {
  const t = useTranslations('superAdmin.pages.radar.publication.recap');
  const messageEchec = useMessageEchecAnnonceur();
  const [locale, setLocale] = useState<RadarMessageLocale>('fr');
  const [copie, setCopie] = useState<'idle' | 'ok' | 'ko'>('idle');

  const message = useQuery<RadarPublishedMessageResponse, ApiError>({
    queryKey: [...radarKeys.publication(advertiserId), 'message', locale],
    queryFn: () => fetchRadarPublishedMessage(advertiserId, locale),
    staleTime: Infinity,
  });
  const texte = message.data?.data;

  const copier = async () => {
    if (!texte) return;
    try {
      await navigator.clipboard.writeText(texte.text);
      setCopie('ok');
    } catch {
      setCopie('ko');
    }
  };

  return (
    <section aria-label={t('message.heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-publication-message">
      <h2 className="font-display text-base font-semibold text-foreground">{t('message.heading')}</h2>
      <p className="text-xs text-muted-foreground">{sousMandat ? t('message.hintMandate') : t('message.hint')}</p>

      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">{t('message.locale')}</legend>
        {RADAR_MESSAGE_LOCALES.map((code) => (
          <label key={code} className="inline-flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="radio"
              name="radar-publication-locale"
              className="size-4 accent-primary"
              checked={locale === code}
              onChange={() => { setLocale(code); setCopie('idle'); }}
            />
            {t(`message.locales.${code}`)}
          </label>
        ))}
      </fieldset>

      {message.isError ? (
        <ErrorState message={`${t('message.loadError')} ${messageEchec(message.error)}`} onRetry={() => void message.refetch()} retryLabel={t('message.retry')} />
      ) : texte ? (
        <>
          <pre
            className="max-h-80 overflow-auto rounded-md bg-muted px-3 py-2 font-sans text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground"
            data-testid="radar-publication-message-texte"
          >
            {texte.text}
          </pre>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={texte.wa_me}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t('message.whatsapp')}
            </a>
            <Button type="button" size="sm" variant="outline" onClick={() => void copier()}>
              {copie === 'ok' ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {t('message.copy')}
            </Button>
            {copie === 'ok' ? <p role="status" className="text-xs text-muted-foreground">{t('message.copied')}</p> : null}
            {copie === 'ko' ? <p role="alert" className="text-xs text-destructive">{t('message.copyFailed')}</p> : null}
          </div>
        </>
      ) : (
        <Skeleton className="h-32 w-full" aria-busy="true" />
      )}
    </section>
  );
}

interface RecapitulatifPublicationProps {
  readonly advertiserId: number;
  readonly publication: RadarPublication;
}

/**
 * TCK-2389 — après la publication : ce qui existe désormais (le compte, l'espace, chaque bien avec son lien public) et
 * le second message.
 */
export function RecapitulatifPublication({ advertiserId, publication }: RecapitulatifPublicationProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.recap');
  // TCK-2394 — sous mandat, aucun compte : la phrase nomme l'espace des mandats.
  const nom = publication.user ? nomAffichable(publication.user) : '';
  const phrase = publication.mandate === true || publication.user === null
    ? t('mandatePublished', { space: publication.agency.name })
    : publication.created_account
      ? t('accountCreated', { name: nom, space: publication.agency.name })
      : t('accountExisting', { name: nom, space: publication.agency.name });

  return (
    <div className="space-y-6" data-testid="radar-publication-recap">
      <section aria-label={t('created')} className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-display text-base font-semibold text-foreground">{t('created')}</h2>
        <p role="status" className="text-sm text-foreground" data-testid="radar-publication-recap-compte">
          {phrase}
        </p>
        <LiensPublics biens={publication.properties} />
      </section>

      <SecondMessage advertiserId={advertiserId} sousMandat={publication.mandate === true} />
    </div>
  );
}
