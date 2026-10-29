'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { nomAffichable } from '@/lib/identite';
import { fetchRadarPublishedMessage, radarKeys } from '@/lib/queries/radar';
import { RADAR_MESSAGE_LOCALES, type RadarMessageLocale, type RadarPublication, type RadarPublishedMessageResponse } from '@/types/radar';
import type { ApiError } from '@/lib/api';

interface RecapitulatifPublicationProps {
  readonly advertiserId: number;
  readonly publication: RadarPublication;
}

/**
 * TCK-2389 — après la publication : ce qui existe désormais (le compte, l'espace, chaque bien avec son lien public) et
 * le second message, « vos annonces sont en ligne » : le texte fixe versionné que l'API compose, son lien WhatsApp et la
 * copie. Le message se compose dans la langue choisie (le français par défaut) ; il n'est lu qu'ici, après la publication.
 */
export function RecapitulatifPublication({ advertiserId, publication }: RecapitulatifPublicationProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.recap');
  const messageErreur = useMessageErreurApi();
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

  const nom = nomAffichable(publication.user);

  return (
    <div className="space-y-6" data-testid="radar-publication-recap">
      <section aria-label={t('created')} className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-display text-base font-semibold text-foreground">{t('created')}</h2>
        <p role="status" className="text-sm text-foreground" data-testid="radar-publication-recap-compte">
          {publication.created_account
            ? t('accountCreated', { name: nom || publication.user.phone, space: publication.agency.name })
            : t('accountExisting', { name: nom || publication.user.phone, space: publication.agency.name })}
        </p>
        <ul className="space-y-1.5" aria-label={t('links')}>
          {publication.properties.map((bien) => (
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
      </section>

      <section aria-label={t('message.heading')} className="space-y-3 rounded-xl border bg-card p-4" data-testid="radar-publication-message">
        <h2 className="font-display text-base font-semibold text-foreground">{t('message.heading')}</h2>
        <p className="text-xs text-muted-foreground">{t('message.hint')}</p>

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
          <ErrorState message={`${t('message.loadError')} ${messageErreur(message.error)}`} onRetry={() => void message.refetch()} retryLabel={t('message.retry')} />
        ) : texte ? (
          <>
            <pre
              className="max-h-80 overflow-auto rounded-md bg-muted px-3 py-2 font-sans text-sm whitespace-pre-wrap text-foreground"
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
    </div>
  );
}
