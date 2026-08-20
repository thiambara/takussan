'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ScrollText } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { DatePicker } from '@/components/ui/date-picker';
import { fetchAuditLog } from '@/lib/queries/super-admin';
import type { AuditLogResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export function CrossTenantAuditTable() {
  const t = useTranslations('superAdmin.audit');
  const messageErreur = useMessageErreurApi();
  const [event, setEvent] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [causerId, setCauserId] = useState('');
  const [page, setPage] = useState(1);

  const params = {
    event: event || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    causerId: causerId ? Number(causerId) : undefined,
    page,
    perPage: 25,
  };

  const { data, isLoading, isError, error } = useQuery<AuditLogResponse, ApiError>({
    queryKey: ['super-admin', 'audit', params],
    queryFn: () => fetchAuditLog(params),
    staleTime: 10_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="text"
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            setPage(1);
          }}
          placeholder={t('eventPlaceholder')}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={causerId}
          onChange={(e) => {
            setCauserId(e.target.value);
            setPage(1);
          }}
          placeholder={t('causerPlaceholder')}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <DatePicker
          value={dateFrom}
          onValueChange={(value) => {
            setDateFrom(value);
            setPage(1);
          }}
          aria-label={t('dateFromAria')}
        />
        <DatePicker
          value={dateTo}
          onValueChange={(value) => {
            setDateTo(value);
            setPage(1);
          }}
          aria-label={t('dateToAria')}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2" data-testid="audit-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-stone-200" aria-hidden="true" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={messageErreur(error, t('error'))} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-600">
              <tr>
                <th className="px-3 py-2">{t('colDate')}</th>
                <th className="px-3 py-2">{t('colEvent')}</th>
                <th className="px-3 py-2">{t('colCauser')}</th>
                <th className="px-3 py-2">{t('colSubject')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {data.data.map((entry) => (
                <tr key={entry.id} data-testid={`audit-row-${entry.id}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-stone-600">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 font-medium text-stone-900">{entry.event ?? '—'}</td>
                  <td className="px-3 py-2 text-stone-600">
                    {entry.causer_type ? `${entry.causer_type.split('\\').pop()} #${entry.causer_id}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-stone-600">
                    {entry.subject_type ? `${entry.subject_type.split('\\').pop()} #${entry.subject_id}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.last_page > 1 ? (
        <div className="flex items-center justify-between text-sm text-stone-600">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-md border border-stone-300 bg-white px-3 py-1 disabled:opacity-50"
          >
            {t('previous')}
          </button>
          <span>
            {t('pagination', {
              current: data.meta.current_page,
              last: data.meta.last_page,
              total: data.meta.total,
            })}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(data.meta.last_page, page + 1))}
            disabled={page >= data.meta.last_page}
            className="rounded-md border border-stone-300 bg-white px-3 py-1 disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
