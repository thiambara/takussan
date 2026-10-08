'use client';

import { useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { localeDateFns } from '@/lib/format/dateFnsLocale';
import {
  useCalendarFeeds,
  useCreateCalendarFeed,
  useCreateUnavailability,
  useDeleteCalendarFeed,
  useDeleteUnavailability,
  useGenerateIcalLink,
  usePropertyConfirmedStays,
  usePropertyUnavailabilities,
  useSyncCalendarFeed,
} from '@/lib/queries/property-calendar';
import type { PropertyCalendarFeed, PropertyUnavailability } from '@/types/property-calendar';

interface PropertyCalendarPanelProps {
  readonly propertyId: number;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Une plage `[start, end)` en jours inclusifs pour le calendrier : la nuit du départ n'en est pas. */
function nights(start: string, end: string): { from: Date; to: Date } {
  return { from: parseISO(start), to: addDays(parseISO(end), -1) };
}

/**
 * TCK-596 §3B (ADR-0041) — le calendrier d'hôte d'un bien en location courte durée.
 *
 * Trois sources sur une même vue : les réservations confirmées, les dates bloquées à la main, et
 * celles qu'importe un calendrier externe (Airbnb, Booking.com…). L'hôte bloque une plage, gère
 * ses flux importés et copie le lien d'export à donner aux autres plateformes. Ce que l'utilisateur
 * peut faire, l'API en juge (`PropertyPolicy::update`) : un refus s'affiche tel qu'elle le dit.
 */
export function PropertyCalendarPanel({ propertyId }: PropertyCalendarPanelProps) {
  const t = useTranslations('property.dashboard.calendar');
  const messageErreur = useMessageErreurApi();
  const dfLocale = localeDateFns(useLocale());
  const [today] = useState(() => iso(new Date()));
  const [horizon] = useState(() => iso(addDays(new Date(), 365)));

  const stays = usePropertyConfirmedStays(propertyId);
  const blocks = usePropertyUnavailabilities(propertyId, today, horizon);
  const feeds = useCalendarFeeds(propertyId);

  const stayRanges = (stays.data?.data ?? []).flatMap((b) =>
    b.start_date && b.end_date ? [nights(b.start_date.slice(0, 10), b.end_date.slice(0, 10))] : [],
  );
  const rows = blocks.data?.data ?? [];
  const manual = rows.filter((u) => u.source === 'manual');
  const imported = rows.filter((u) => u.source === 'ical');

  const longDate = (day: string) => format(parseISO(day), 'd MMM yyyy', { locale: dfLocale });
  const errorOf = (e: unknown) => messageErreur(e, t('genericError'));

  return (
    <div className="space-y-6" data-testid="property-calendar-panel">
      <section className="rounded-xl bg-card p-4 sm:p-6">
        <header className="space-y-1">
          <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
          <p className="text-pretty text-sm text-muted-foreground">{t('description')}</p>
        </header>
        {stays.isLoading || blocks.isLoading ? (
          <Skeleton className="mt-4 h-72 w-full max-w-sm" />
        ) : (
          <>
            <Calendar
              className="mt-4 rounded-lg border border-border"
              mode="single"
              disabled={() => true}
              modifiers={{
                booked: stayRanges,
                blocked: manual.map((u) => nights(u.starts_on, u.ends_on)),
                imported: imported.map((u) => nights(u.starts_on, u.ends_on)),
              }}
              modifiersClassNames={{
                booked: 'bg-primary/20 text-foreground font-semibold',
                blocked: 'bg-accent/25 text-foreground',
                imported: 'bg-secondary text-secondary-foreground line-through',
              }}
            />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t('legend')}>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm bg-primary/20" />
                {t('legendBooked')}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm bg-accent/25" />
                {t('legendBlocked')}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm bg-secondary" />
                {t('legendImported')}
              </li>
            </ul>
          </>
        )}
      </section>

      <BlockDatesSection propertyId={propertyId} today={today} errorOf={errorOf} />

      <section className="rounded-xl bg-card p-4 sm:p-6" data-testid="calendar-blocks">
        <h2 className="font-display text-base font-semibold text-foreground">{t('blocksTitle')}</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('blocksEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {rows.map((u) => (
              <BlockRow key={u.id} propertyId={propertyId} row={u} longDate={longDate} errorOf={errorOf} />
            ))}
          </ul>
        )}
      </section>

      <FeedsSection propertyId={propertyId} feeds={feeds.data?.data ?? []} errorOf={errorOf} />

      <ExportLinkSection propertyId={propertyId} errorOf={errorOf} />
    </div>
  );
}

function BlockDatesSection({
  propertyId,
  today,
  errorOf,
}: {
  readonly propertyId: number;
  readonly today: string;
  readonly errorOf: (e: unknown) => string;
}) {
  const t = useTranslations('property.dashboard.calendar');
  const create = useCreateUnavailability(propertyId);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ starts_on: startsOn, ends_on: endsOn, reason: reason || undefined });
      setStartsOn('');
      setEndsOn('');
      setReason('');
    } catch (err) {
      setError(errorOf(err));
    }
  }

  return (
    <section className="rounded-xl bg-card p-4 sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">{t('blockTitle')}</h2>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">{t('blockHint')}</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3" data-testid="calendar-block-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-foreground">{t('blockFrom')}</span>
            <DatePicker required value={startsOn} onValueChange={setStartsOn} min={today} placeholder={t('blockFrom')} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-foreground">{t('blockTo')}</span>
            <DatePicker required value={endsOn} onValueChange={setEndsOn} min={startsOn || today} placeholder={t('blockTo')} />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">{t('blockReason')}</span>
          <Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending || !startsOn || !endsOn}>
            {t('blockSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function BlockRow({
  propertyId,
  row,
  longDate,
  errorOf,
}: {
  readonly propertyId: number;
  readonly row: PropertyUnavailability;
  readonly longDate: (day: string) => string;
  readonly errorOf: (e: unknown) => string;
}) {
  const t = useTranslations('property.dashboard.calendar');
  const remove = useDeleteUnavailability(propertyId);
  const [error, setError] = useState<string | null>(null);
  const lastNight = format(addDays(parseISO(row.ends_on), -1), 'yyyy-MM-dd');

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-foreground">
          {t('range', { from: longDate(row.starts_on), to: longDate(lastNight) })}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.source === 'ical' ? t('importedFrom', { feed: row.feed_name ?? '' }) : (row.reason ?? t('manual'))}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {row.conflict_booking_id !== null && <Badge variant="destructive">{t('conflict')}</Badge>}
        {row.source === 'manual' && (
          <Button
            type="button"
            variant="outline"
            className="h-10 sm:h-8"
            disabled={remove.isPending}
            onClick={() => {
              setError(null);
              remove.mutateAsync({ id: row.id }).catch((e: unknown) => setError(errorOf(e)));
            }}
          >
            {t('unblock')}
          </Button>
        )}
      </div>
    </li>
  );
}

function FeedsSection({
  propertyId,
  feeds,
  errorOf,
}: {
  readonly propertyId: number;
  readonly feeds: readonly PropertyCalendarFeed[];
  readonly errorOf: (e: unknown) => string;
}) {
  const t = useTranslations('property.dashboard.calendar');
  const create = useCreateCalendarFeed(propertyId);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ url, label: label || undefined });
      setUrl('');
      setLabel('');
    } catch (err) {
      setError(errorOf(err));
    }
  }

  return (
    <section className="rounded-xl bg-card p-4 sm:p-6" data-testid="calendar-feeds">
      <h2 className="font-display text-base font-semibold text-foreground">{t('feedsTitle')}</h2>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">{t('feedsHint')}</p>
      {feeds.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {feeds.map((feed) => (
            <FeedRow key={feed.id} propertyId={propertyId} feed={feed} errorOf={errorOf} />
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="space-y-1 text-sm">
            <span className="text-foreground">{t('feedUrl')}</span>
            <Input
              type="url"
              required
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-foreground">{t('feedLabel')}</span>
            <Input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending || url === ''}>
            {t('feedAdd')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function FeedRow({
  propertyId,
  feed,
  errorOf,
}: {
  readonly propertyId: number;
  readonly feed: PropertyCalendarFeed;
  readonly errorOf: (e: unknown) => string;
}) {
  const t = useTranslations('property.dashboard.calendar');
  const sync = useSyncCalendarFeed(propertyId);
  const remove = useDeleteCalendarFeed(propertyId);
  const [error, setError] = useState<string | null>(null);
  const failing = feed.last_status === 'failed';
  const pending = feed.last_status === 'pending';

  const run = (action: Promise<unknown>) => {
    setError(null);
    action.catch((e: unknown) => setError(errorOf(e)));
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate font-medium text-foreground">{feed.label || feed.url_host}</p>
        <p className="text-xs text-muted-foreground">
          {feed.url_host}
          {' · '}
          {failing
            ? t('feedFailing', { count: feed.consecutive_failures })
            : pending
              ? t('feedPending')
              : t('feedOk')}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 sm:h-8"
          disabled={sync.isPending}
          onClick={() => run(sync.mutateAsync({ id: feed.id }))}
        >
          {t('feedSync')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 sm:h-8"
          disabled={remove.isPending}
          onClick={() => run(remove.mutateAsync({ id: feed.id }))}
        >
          {t('feedRemove')}
        </Button>
      </div>
    </li>
  );
}

function ExportLinkSection({
  propertyId,
  errorOf,
}: {
  readonly propertyId: number;
  readonly errorOf: (e: unknown) => string;
}) {
  const t = useTranslations('property.dashboard.calendar');
  const generate = useGenerateIcalLink(propertyId);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setCopied(false);
    try {
      const res = await generate.mutateAsync();
      setUrl(res.data.url);
    } catch (e) {
      setError(errorOf(e));
    }
  }

  async function handleCopy() {
    if (url === null) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-xl bg-card p-4 sm:p-6" data-testid="calendar-export">
      <h2 className="font-display text-base font-semibold text-foreground">{t('exportTitle')}</h2>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">{t('exportHint')}</p>
      {url !== null && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={url} aria-label={t('exportUrl')} className="min-w-0 flex-1" />
          <Button type="button" variant="outline" onClick={() => void handleCopy()}>
            {copied ? t('exportCopied') : t('exportCopy')}
          </Button>
        </div>
      )}
      {url !== null && <p className="mt-2 text-pretty text-xs text-muted-foreground">{t('exportOnce')}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" disabled={generate.isPending} onClick={() => void handleGenerate()}>
          {t('exportGenerate')}
        </Button>
      </div>
    </section>
  );
}
