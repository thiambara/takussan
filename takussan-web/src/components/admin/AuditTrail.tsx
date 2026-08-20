'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileSpreadsheet, FileText, Loader2, ScrollText, Search, ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { formatDate as formatDateIntl } from '@/lib/format';
import type { Locale } from '@/i18n/config';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchAuditLogs,
  buildExportUrl,
  type AuditLogFilters,
  type ActivityLogEntry,
} from '@/lib/queries/audit-logs';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

const KNOWN_EVENTS = ['created', 'updated', 'deleted', 'exported'] as const;

/**
 * TCK-292 — la DONNÉE porte la clé, le rendu la résout : la liste des types
 * d'objet transporte le FQCN (valeur d'API) et une clé de libellé résolue sous
 * `admin.audit.subjects.*`. Les noms d'événements (`created`, `updated`, …) sont
 * des valeurs d'API affichées telles quelles — elles ne se traduisent pas.
 */
const KNOWN_SUBJECT_TYPES: { key: string; value: string }[] = [
  { key: 'property', value: 'App\\Models\\Property' },
  { key: 'booking', value: 'App\\Models\\Booking' },
  { key: 'lease', value: 'App\\Models\\Lease' },
  { key: 'invoice', value: 'App\\Models\\Invoice' },
  { key: 'customer', value: 'App\\Models\\Customer' },
  { key: 'user', value: 'App\\Models\\User' },
];

const ANY = '__any__';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function eventBadgeVariant(event: string | null): string {
  switch (event) {
    case 'created': return 'bg-emerald-100 text-emerald-700';
    case 'updated': return 'bg-blue-100 text-blue-700';
    case 'deleted': return 'bg-red-100 text-red-700';
    case 'exported': return 'bg-orange-100 text-orange-700';
    default: return 'bg-stone-100 text-stone-600';
  }
}

function shortSubjectType(fqcn: string | null): string {
  if (!fqcn) return '—';
  return fqcn.split('\\').pop() ?? fqcn;
}

/**
 * TCK-292 — la locale ACTIVE, plus `fr-FR` en dur. Les options sont celles de
 * l'ancienne version, à l'identique : le rendu français ne bouge pas.
 */
function formatDate(iso: string, locale: Locale): string {
  return formatDateIntl(iso, locale, {
    // `formatDate` pose `dateStyle: 'medium'` par défaut, et Intl REFUSE
    // `dateStyle` mêlé à des champs explicites — on le neutralise.
    dateStyle: undefined,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function AuditTrail() {
  const t = useTranslations('admin.audit');
  const eventOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: ANY, label: t('filters.anyAction') },
    ...KNOWN_EVENTS.map((ev) => ({ value: ev, label: ev })),
  ];
  const subjectTypeOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: ANY, label: t('filters.anySubject') },
    ...KNOWN_SUBJECT_TYPES.map((st) => ({ value: st.value, label: t(`subjects.${st.key}`) })),
  ];
  const { token } = useAuth();
  const toast = useToast();

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo());
  const [dateTo, setDateTo] = useState(today());
  const [event, setEvent] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const filters: AuditLogFilters = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    event: event || undefined,
    subject_type: subjectType || undefined,
    search: search || undefined,
    page,
    per_page: 50,
  }), [dateFrom, dateTo, event, subjectType, search, page]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => fetchAuditLogs(token ?? '', filters),
    enabled: Boolean(token),
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;

  const handleExport = useCallback(async (format: 'csv' | 'xlsx') => {
    if (!token) return;
    setShowExportMenu(false);
    setExportLoading(true);

    toast.add({
      title: t('export.pending'),
      type: 'info',
    });

    try {
      const exportFilters: AuditLogFilters = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        event: event || undefined,
        subject_type: subjectType || undefined,
        search: search || undefined,
      };

      const url = buildExportUrl(API_URL, format, exportFilters);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      if (res.status === 202) {
        toast.add({
          title: t('export.largeTitle'),
          description: t('export.largeBody'),
          type: 'info',
        });
        return;
      }

      if (!res.ok) {
        toast.add({ title: t('export.error'), type: 'error' });
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;

      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^";\n]+)"?/.exec(disposition);
      a.download = match?.[1] ?? `audit-trail.${format}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.add({ title: t('export.error'), type: 'error' });
    } finally {
      setExportLoading(false);
    }
  }, [token, dateFrom, dateTo, event, subjectType, search, toast, t]);

  return (
    <div className="space-y-4">
      {/* ─── Sticky filter bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-app-ink-muted">{t('filters.from')}</label>
          <DatePicker
            value={dateFrom}
            max={dateTo || today()}
            onValueChange={(value) => { setDateFrom(value); setPage(1); }}
            buttonClassName="h-9"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-app-ink-muted">{t('filters.to')}</label>
          <DatePicker
            value={dateTo}
            min={dateFrom}
            max={today()}
            onValueChange={(value) => { setDateTo(value); setPage(1); }}
            buttonClassName="h-9"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-app-ink-muted">{t('filters.action')}</label>
          <Select
            value={event || ANY}
            onValueChange={(next) => { setEvent(next === ANY ? '' : (next ?? '')); setPage(1); }}
            items={eventOptions}
          >
            <SelectTrigger className="h-9" aria-label={t('filters.actionAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-app-ink-muted">{t('filters.subject')}</label>
          <Select
            value={subjectType || ANY}
            onValueChange={(next) => { setSubjectType(next === ANY ? '' : (next ?? '')); setPage(1); }}
            items={subjectTypeOptions}
          >
            <SelectTrigger className="h-9" aria-label={t('filters.subjectAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subjectTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-app-ink-muted">{t('filters.search')}</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-app-ink-muted" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('filters.searchPlaceholder')}
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="ml-auto flex items-end">
          <div className="relative">
            <Button
              variant="default"
              size="sm"
              disabled={exportLoading}
              onClick={() => setShowExportMenu((v) => !v)}
              className="gap-1.5"
            >
              {exportLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              {t('export.label')}
            </Button>

            {showExportMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-background shadow-md">
                <button
                  onClick={() => handleExport('csv')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-stone-50"
                >
                  <FileText className="h-4 w-4 text-app-ink-muted" />
                  CSV
                </button>
                <button
                  onClick={() => handleExport('xlsx')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-stone-50"
                >
                  <FileSpreadsheet className="h-4 w-4 text-app-ink-muted" />
                  Excel (XLSX)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Table ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-app-ink-muted" />
        </div>
      ) : isError ? (
        <ErrorState
          icon={<ShieldAlert className="size-5" aria-hidden="true" />}
          message={t('error')}
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-stone-50 text-left">
                <th className="px-4 py-3 font-medium text-app-ink-muted">{t('columns.date')}</th>
                <th className="px-4 py-3 font-medium text-app-ink-muted">{t('columns.user')}</th>
                <th className="px-4 py-3 font-medium text-app-ink-muted">{t('columns.action')}</th>
                <th className="px-4 py-3 font-medium text-app-ink-muted">{t('columns.subject')}</th>
                <th className="px-4 py-3 font-medium text-app-ink-muted">{t('columns.description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <AuditRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Pagination ────────────────────────────────────────────────── */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-app-ink-muted">
          <span>{t('entries', { count: meta.total, total: String(meta.total) })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('previous')}
            </Button>
            <span className="flex items-center px-2">
              {t('pageOf', {
                current: String(meta.current_page),
                last: String(meta.last_page),
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: ActivityLogEntry }) {
  const locale = useLocale() as Locale;
  const causerName = log.causer?.name ?? log.causer?.email ?? 'system';
  const subjType = shortSubjectType(log.subject_type);

  return (
    <tr className="transition-colors hover:bg-stone-50">
      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-app-ink-muted">
        {formatDate(log.created_at, locale)}
      </td>
      <td className="px-4 py-3">
        <span className="font-medium text-app-ink">{causerName}</span>
        {log.causer?.email && log.causer.name && (
          <p className="text-xs text-app-ink-muted">{log.causer.email}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', eventBadgeVariant(log.event))}>
          {log.event ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        {log.subject_type ? (
          <span className="text-app-ink">
            {subjType}{' '}
            {log.subject_id && (
              <span className="text-app-ink-muted">#{log.subject_id}</span>
            )}
          </span>
        ) : '—'}
      </td>
      <td className="max-w-xs truncate px-4 py-3 text-app-ink-muted">
        {log.description ?? '—'}
      </td>
    </tr>
  );
}
