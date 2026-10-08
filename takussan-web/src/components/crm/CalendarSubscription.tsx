'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Copy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  AGENT_CRM_QUERY_KEY,
  fetchCalendarFeed,
  issueCalendarFeed,
  revokeCalendarFeed,
} from '@/lib/queries/agent-crm';
import type { CalendarFeedState } from '@/types/agent-crm';

/**
 * TCK-591 §6 (ADR-0034) — s'abonner à son agenda depuis Google Agenda ou le calendrier du
 * téléphone. Le lien est un SECRET : l'API ne le rend qu'une fois, à la création ou à la rotation ;
 * ensuite la page ne sait plus que « un lien est actif ». Le perdre, c'est en générer un autre, ce
 * qui éteint l'ancien.
 */
export function CalendarSubscription() {
  const t = useTranslations('agentCrm.calendar.feed');
  const locale = useLocale() as Locale;
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const state = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.calendarFeed(),
    queryFn: () => fetchCalendarFeed(token ?? ''),
    enabled: !!token,
  });

  const issue = useMutation<CalendarFeedState, ApiError, void>({
    mutationFn: () => issueCalendarFeed(token ?? ''),
    onSuccess: (feed) => {
      setIssuedUrl(feed.url ?? null);
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: AGENT_CRM_QUERY_KEY.calendarFeed() });
    },
  });
  const revoke = useMutation<void, ApiError, void>({
    mutationFn: () => revokeCalendarFeed(token ?? ''),
    onSuccess: () => {
      setIssuedUrl(null);
      void queryClient.invalidateQueries({ queryKey: AGENT_CRM_QUERY_KEY.calendarFeed() });
    },
  });

  const active = issuedUrl !== null || state.data?.active === true;
  const webcal = issuedUrl?.replace(/^https?:/, 'webcal:') ?? null;
  const failure = issue.error ?? revoke.error;

  return (
    <section aria-labelledby="calendar-feed-title" className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 id="calendar-feed-title" className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
        <CalendarPlus className="size-4" aria-hidden="true" />
        {t('title')}
      </h2>
      <p className="text-pretty text-muted-foreground">{t('intro')}</p>

      {issuedUrl && webcal ? (
        <div className="space-y-2">
          <p className="font-medium text-foreground">{t('onceOnly')}</p>
          <div className="flex gap-2">
            <Input readOnly value={issuedUrl} aria-label={t('linkLabel')} onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0"
              onClick={() => {
                void navigator.clipboard?.writeText(issuedUrl).then(() => setCopied(true));
              }}
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('google')}
            </a>
            <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={webcal}>
              {t('apple')}
            </a>
          </div>
        </div>
      ) : active ? (
        <p className="text-muted-foreground">
          {t('activeSince', { date: state.data?.created_at ? formatDateTime(state.data.created_at, locale) : '—' })}
          {state.data?.last_accessed_at
            ? ` ${t('lastAccess', { date: formatDateTime(state.data.last_accessed_at, locale) })}`
            : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={issue.isPending || state.isPending} onClick={() => issue.mutate()}>
          {active ? t('rotate') : t('create')}
        </Button>
        {active ? (
          <Button type="button" size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {t('revoke')}
          </Button>
        ) : null}
      </div>
      {active ? <p className="text-xs text-muted-foreground">{t('rotateHint')}</p> : null}
      {failure ? <p role="alert" className="text-destructive">{failure.proseServeur ?? t('failed')}</p> : null}
    </section>
  );
}
