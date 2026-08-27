'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/feedback';
import { fetchAdminAgencies } from '@/lib/queries/super-admin';
import { AgencyModerationCard } from '@/components/admin/super/AgencyModerationCard';
import { AgencyOnboardingDialog } from '@/components/admin/super/AgencyOnboardingDialog';
import { DebouncedSearchInput, FilterBar, Pagination } from '@/components/console';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AdminAgenciesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';

const ALL = '__all__';

/**
 * Patron « la donnée porte la clé » (TCK-286) : tables hors composant, donc hors de portée
 * de `useTranslations`. Elles transportent une clé, le rendu la résout.
 */
const STATUS_OPTIONS = [
  { value: ALL, labelKey: 'statuses.all' },
  { value: 'active', labelKey: 'statuses.active' },
  { value: 'inactive', labelKey: 'statuses.inactive' },
  { value: 'suspended', labelKey: 'statuses.suspended' },
];

const SORT_OPTIONS = [
  { value: '-created_at', labelKey: 'sorts.createdDesc' },
  { value: 'created_at', labelKey: 'sorts.createdAsc' },
  { value: 'name', labelKey: 'sorts.nameAsc' },
  { value: '-name', labelKey: 'sorts.nameDesc' },
  { value: '-members_count', labelKey: 'sorts.membersDesc' },
  { value: '-properties_count', labelKey: 'sorts.propertiesDesc' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export default function SuperAdminAgenciesPage() {
  const t = useTranslations('superAdmin.agencies');
  const tPage = useTranslations('superAdmin.pages.agencies');
  const tFiltres = useTranslations('console.filterBar');
  const messageErreur = useMessageErreurApi();
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<SortValue>('-created_at');
  const [page, setPage] = useState(1);
  const statusOptions = STATUS_OPTIONS.map((o) => ({ value: o.value, label: tPage(o.labelKey) }));
  const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value as string, label: tPage(o.labelKey) }));

  const params = {
    status: status === ALL ? undefined : status,
    search: search || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort,
    page,
    perPage: 15,
  };

  const { data, isLoading, isFetching, isError, error } = useQuery<AdminAgenciesResponse, ApiError>({
    queryKey: ['super-admin', 'agencies', params],
    queryFn: () => fetchAdminAgencies(params),
    staleTime: 15_000,
  });

  // Le tri n'est pas un filtre : il ne compte pas dans « des filtres sont posés », mais la
  // remise à zéro le reprend quand même — c'est ce que « valeur par défaut » veut dire.
  const filtresPoses =
    status !== ALL || search !== '' || createdFrom !== '' || createdTo !== '';

  const reinitialiser = useCallback(() => {
    setStatus(ALL);
    setSearch('');
    setCreatedFrom('');
    setCreatedTo('');
    setSort('-created_at');
    setPage(1);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage('title')}
        description={tPage('subtitle')}
        actions={<AgencyOnboardingDialog />}
      />

      <FilterBar
        data-testid="super-admin-agencies-filters"
        controlsClassName="md:grid-cols-2 xl:grid-cols-5"
        resultCount={data ? tFiltres('results', { count: data.meta.total }) : undefined}
        onReset={reinitialiser}
        resetLabel={tFiltres('reset')}
        resetDisabled={!filtresPoses}
      >
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus((next ?? ALL) as string);
            setPage(1);
          }}
          items={statusOptions}
        >
          <SelectTrigger aria-label={tPage('statusAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DebouncedSearchInput
          value={search}
          onCommit={(next) => {
            setSearch(next);
            setPage(1);
          }}
          placeholder={tPage('searchPlaceholder')}
          aria-label={tPage('searchAria')}
          busy={isFetching}
        />

        <DatePicker
          value={createdFrom}
          onValueChange={(value) => {
            setCreatedFrom(value);
            setPage(1);
          }}
          aria-label={tPage('createdFromAria')}
          buttonClassName="h-10 w-full"
        />
        <DatePicker
          value={createdTo}
          onValueChange={(value) => {
            setCreatedTo(value);
            setPage(1);
          }}
          aria-label={tPage('createdToAria')}
          buttonClassName="h-10 w-full"
        />

        <Select
          value={sort}
          onValueChange={(next) => {
            setSort((next ?? '-created_at') as SortValue);
            setPage(1);
          }}
          items={sortOptions}
        >
          <SelectTrigger aria-label={tPage('sortAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="agencies-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={messageErreur(error, t('error'))} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.data.map((agency) => (
              <AgencyModerationCard key={agency.id} agency={agency} />
            ))}
          </div>
          <Pagination
            page={data.meta.current_page}
            lastPage={data.meta.last_page}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
