'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Download, Loader2, ScrollText, ShieldAlert } from 'lucide-react';
import {
  DataState,
  DataTable,
  DebouncedSearchInput,
  FilterBar,
  Pagination,
  type DataTableColumn,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { exportAuditLog, fetchAuditLog, type AuditLogExport } from '@/lib/queries/super-admin';
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
  const [sensitive, setSensitive] = useState(false);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const garde = useGardeDoubleFacteur();

  const filtres = {
    event: event || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    causerId: causerId ? Number(causerId) : undefined,
    sensitive: sensitive || undefined,
  };
  const params = { ...filtres, page, perPage: 25 };

  const filtresPoses =
    event !== '' || causerId !== '' || dateFrom !== '' || dateTo !== '' || sensitive;
  const reinitialiser = () => {
    setEvent('');
    setCauserId('');
    setDateFrom('');
    setDateTo('');
    setSensitive(false);
    setPage(1);
  };

  /**
   * TCK-601 — l'export reprend EXACTEMENT les filtres affichés (préréglage compris) : exporter
   * autre chose que ce qu'on regarde serait une surprise. L'API rend un lien signé, ouvert ici.
   */
  const exportMutation = useMutation<AuditLogExport, ApiError>({
    mutationFn: () => avecGardeDoubleFacteur(() => exportAuditLog(filtres), garde),
    onSuccess: (resultat) => {
      const a = document.createElement('a');
      a.href = resultat.url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.add({ title: t('export.ready', { count: resultat.count }), type: 'success' });
    },
    onError: (err) => {
      toast.add({ title: t('export.error'), description: messageErreur(err), type: 'error' });
    },
  });

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
      {/* TCK-601 — le préréglage et l'export, au-dessus des filtres : le premier change CE QU'ON
          regarde, le second l'emporte. L'export reste `outline` — un geste secondaire. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t('presets.aria')} className="inline-flex rounded-lg border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={sensitive ? 'ghost' : 'secondary'}
            aria-pressed={!sensitive}
            onClick={() => { setSensitive(false); setPage(1); }}
          >
            {t('presets.all')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sensitive ? 'secondary' : 'ghost'}
            aria-pressed={sensitive}
            onClick={() => { setSensitive(true); setPage(1); }}
          >
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            {t('presets.sensitive')}
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-1.5"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          {exportMutation.isPending
            ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            : <Download className="size-4" aria-hidden="true" />}
          {t('export.label')}
        </Button>
      </div>
      {sensitive ? (
        <p className="text-sm text-pretty text-muted-foreground">{t('presets.sensitiveHint')}</p>
      ) : null}

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
