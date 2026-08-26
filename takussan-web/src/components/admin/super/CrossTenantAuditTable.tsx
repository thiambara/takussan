'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ScrollText } from 'lucide-react';
import {
  DataState,
  DataTable,
  FilterBar,
  type DataTableColumn,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { fetchAuditLog } from '@/lib/queries/super-admin';
import type { AuditLogEntry, AuditLogResponse } from '@/types/super-admin';
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

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      id: 'date',
      header: t('colDate'),
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (entry) => (entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'),
    },
    {
      id: 'event',
      header: t('colEvent'),
      className: 'font-medium text-foreground',
      cell: (entry) => entry.event ?? '—',
    },
    {
      id: 'causer',
      header: t('colCauser'),
      className: 'text-muted-foreground',
      cell: (entry) =>
        entry.causer_type ? `${entry.causer_type.split('\\').pop()} #${entry.causer_id}` : '—',
    },
    {
      id: 'subject',
      header: t('colSubject'),
      className: 'text-muted-foreground',
      cell: (entry) =>
        entry.subject_type ? `${entry.subject_type.split('\\').pop()} #${entry.subject_id}` : '—',
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar controlsClassName="sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="text"
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            setPage(1);
          }}
          placeholder={t('eventPlaceholder')}
        />
        <Input
          type="number"
          value={causerId}
          onChange={(e) => {
            setCauserId(e.target.value);
            setPage(1);
          }}
          placeholder={t('causerPlaceholder')}
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
      </FilterBar>

      <DataState
        data-testid="audit-loading"
        loading={isLoading}
        error={isError ? messageErreur(error, t('error')) : null}
        isEmpty={!data || data.data.length === 0}
        skeletonRows={6}
        skeletonRowClassName="h-10"
        emptyState={
          <EmptyState
            icon={<ScrollText className="size-8" aria-hidden="true" />}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        }
      >
        <DataTable
          caption={t('tableCaption')}
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(entry) => entry.id}
          rowProps={(entry) => ({ 'data-testid': `audit-row-${entry.id}` })}
        />
      </DataState>

      {data && data.meta.last_page > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            {t('previous')}
          </Button>
          <span>
            {t('pagination', {
              current: data.meta.current_page,
              last: data.meta.last_page,
              total: data.meta.total,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(data.meta.last_page, page + 1))}
            disabled={page >= data.meta.last_page}
          >
            {t('next')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
