'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2Off } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
/** Une ligne « clé · valeur » de la feuille. */
function Ligne({ cle, children }: { readonly cle: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-baseline justify-between gap-4 py-2.5">
      <dt className="flex-none text-sm text-muted-foreground">{cle}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * TCK-2597 — la feuille « Abonnement iCal » de l'agenda (maquette `app-agenda` a-5) : le lien privé,
 * Copier, Google et Apple au moment où il est généré ; ensuite, sa date, sa dernière lecture et
 * « Révoquer le lien ».
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
    <section aria-label={t('title')} className="space-y-4 pt-1">
      <p className="text-pretty text-sm leading-snug text-encre-douce">{t('intro')}</p>

      {issuedUrl && webcal ? (
        <>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t('linkLabel')}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={issuedUrl} aria-label={t('linkLabel')} className="h-11 bg-muted/50" onFocus={(e) => e.currentTarget.select()} />
              <Button
                type="button"
                className="h-11 shrink-0 gap-1.5 bg-foreground text-background hover:bg-foreground/90"
                onClick={() => {
                  void navigator.clipboard?.writeText(issuedUrl).then(() => setCopied(true));
                }}
              >
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" strokeWidth={1.75} aria-hidden="true" />}
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('onceOnly')}</p>
          </div>
          <div className="grid gap-2">
            <a className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')} href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">
              {t('google')}
            </a>
            <a className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')} href={webcal}>
              {t('apple')}
            </a>
          </div>
        </>
      ) : null}

      {active ? (
        <>
          <dl className="divide-y divide-border border-y border-border">
            <Ligne cle={t('createdAt')}>{state.data?.created_at ? formatDateTime(state.data.created_at, locale) : '—'}</Ligne>
            <Ligne cle={t('lastAccessLabel')}>{state.data?.last_accessed_at ? formatDateTime(state.data.last_accessed_at, locale) : t('never')}</Ligne>
            <Ligne cle={t('contentLabel')}>{t('content')}</Ligne>
          </dl>
          <button
            type="button"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
            className="flex min-h-11 w-full items-center gap-3 text-left text-corps text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
          >
            <Link2Off className="size-icone flex-none" strokeWidth={1.75} aria-hidden="true" />
            <span>
              {t('revoke')}
              <span className="block text-ui text-muted-foreground">{t('revokeHint')}</span>
            </span>
          </button>
          {issuedUrl ? null : (
            <div>
              <Button type="button" variant="outline" disabled={issue.isPending || state.isPending} onClick={() => issue.mutate()}>
                {t('rotate')}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">{t('rotateHint')}</p>
            </div>
          )}
        </>
      ) : (
        <Button type="button" disabled={issue.isPending || state.isPending} onClick={() => issue.mutate()}>
          {t('create')}
        </Button>
      )}
      {failure ? <p role="alert" className="text-sm text-destructive">{failure.proseServeur ?? t('failed')}</p> : null}
    </section>
  );
}
