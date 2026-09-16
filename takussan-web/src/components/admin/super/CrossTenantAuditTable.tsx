'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ScrollText } from 'lucide-react';
import {
  DataState,
  DataTable,
  DebouncedSearchInput,
  FilterBar,
  Pagination,
  type DataTableColumn,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { fetchAuditLog } from '@/lib/queries/super-admin';
import type { AuditLogEntry, AuditLogResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

export function CrossTenantAuditTable() {
  const t = useTranslations('superAdmin.audit');
  const tFiltres = useTranslations('console.filterBar');
  const fmt = useFormatteurs();
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

  const filtresPoses = event !== '' || causerId !== '' || dateFrom !== '' || dateTo !== '';
  const reinitialiser = () => {
    setEvent('');
    setCauserId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error } = useQuery<AuditLogResponse, ApiError>({
    queryKey: ['super-admin', 'audit', params],
    queryFn: () => fetchAuditLog(params),
    staleTime: 10_000,
  });

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      id: 'date',
      header: t('colDate'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (entry) => fmt.dateTime(entry.created_at),
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
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (entry) =>
        entry.causer_type ? `${entry.causer_type.split('\\').pop()} #${entry.causer_id}` : '—',
    },
    {
      id: 'subject',
      header: t('colSubject'),
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (entry) =>
        entry.subject_type ? `${entry.subject_type.split('\\').pop()} #${entry.subject_id}` : '—',
    },
  ];

  return (
    <div className="space-y-4">
      {/* `xl` pour quatre colonnes : à 1024 la coque laisse 720 px, et le placeholder de
          l'événement se coupait. Les champs n'avaient que leur placeholder pour nom. */}
      <FilterBar
        controlsClassName="sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4"
        resultCount={data ? tFiltres('results', { count: data.meta.total }) : undefined}
        onReset={reinitialiser}
        resetLabel={tFiltres('reset')}
        resetDisabled={!filtresPoses}
      >
        {/* Une requête par frappe partait sur le journal entier : la saisie est différée. */}
        <DebouncedSearchInput
          value={event}
          onCommit={(next) => {
            setEvent(next);
            setPage(1);
          }}
          placeholder={t('eventPlaceholder')}
          aria-label={t('eventAria')}
          busy={isFetching}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={causerId}
          onChange={(e) => {
            setCauserId(e.target.value);
            setPage(1);
          }}
          placeholder={t('causerPlaceholder')}
          aria-label={t('causerAria')}
          className="h-10"
        />
        <DatePicker
          value={dateFrom}
          onValueChange={(value) => {
            setDateFrom(value);
            setPage(1);
          }}
          aria-label={t('dateFromAria')}
          placeholder={t('dateFromAria')}
          buttonClassName="h-10 w-full"
        />
        <DatePicker
          value={dateTo}
          onValueChange={(value) => {
            setDateTo(value);
            setPage(1);
          }}
          aria-label={t('dateToAria')}
          placeholder={t('dateToAria')}
          buttonClassName="h-10 w-full"
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

      {data ? (
        // Le total vit désormais dans la barre de filtres ; la pagination est celle des consoles.
        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} onChange={setPage} />
      ) : null}
    </div>
  );
}
