'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { fetchAdminAgencies } from '@/lib/queries/super-admin';
import { AgencyModerationCard } from '@/components/admin/super/AgencyModerationCard';
import { AgencyOnboardingDialog } from '@/components/admin/super/AgencyOnboardingDialog';
import { Pagination } from '@/components/super-admin/Pagination';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

const ALL = '__all__';

const STATUS_OPTIONS = [
  { value: ALL, label: 'Tous statuts' },
  { value: 'active', label: 'Actives' },
  { value: 'inactive', label: 'Inactives' },
  { value: 'suspended', label: 'Suspendues' },
];

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Création récente' },
  { value: 'created_at', label: 'Création ancienne' },
  { value: 'name', label: 'Nom A-Z' },
  { value: '-name', label: 'Nom Z-A' },
  { value: '-members_count', label: 'Équipe élevée' },
  { value: '-properties_count', label: 'Portefeuille élevé' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export default function SuperAdminAgenciesPage() {
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<SortValue>('-created_at');
  const [page, setPage] = useState(1);

  const params = {
    status: status === ALL ? undefined : status,
    search: search || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort,
    page,
    perPage: 15,
  };

  const { data, isLoading, isError, error } = useQuery<AdminAgenciesResponse, ApiError>({
    queryKey: ['super-admin', 'agencies', params],
    queryFn: () => fetchAdminAgencies(params),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Agences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Modération cross-tenant — vérification, suspension, retrait de vérification.
          </p>
        </div>
        <AgencyOnboardingDialog />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus((next ?? ALL) as string);
            setPage(1);
          }}
          items={STATUS_OPTIONS}
        >
          <SelectTrigger aria-label="Statut" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-64 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher (nom, slug, email)"
            className="h-10 pl-9"
          />
        </div>

        <DatePicker
          value={createdFrom}
          onValueChange={(value) => {
            setCreatedFrom(value);
            setPage(1);
          }}
          aria-label="Créée à partir du"
          buttonClassName="h-10"
          className="w-44"
        />
        <DatePicker
          value={createdTo}
          onValueChange={(value) => {
            setCreatedTo(value);
            setPage(1);
          }}
          aria-label="Créée jusqu’au"
          buttonClassName="h-10"
          className="w-44"
        />

        <Select
          value={sort}
          onValueChange={(next) => {
            setSort((next ?? '-created_at') as SortValue);
            setPage(1);
          }}
          items={SORT_OPTIONS as readonly { value: string; label: string }[]}
        >
          <SelectTrigger aria-label="Tri" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          Erreur de chargement. {error?.displayMessage}
        </div>
      ) : !data || data.data.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aucune agence à afficher pour les filtres courants.
          </CardContent>
        </Card>
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
