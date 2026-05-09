'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminAgencies } from '@/lib/queries/super-admin';
import { AgencyModerationCard } from '@/components/admin/super/AgencyModerationCard';
import { AgencyOnboardingDialog } from '@/components/admin/super/AgencyOnboardingDialog';
import type { AdminAgenciesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

const STATUS_OPTIONS = [
  { value: '', label: 'Tous statuts' },
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

export default function SuperAdminAgenciesPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('-created_at');
  const [page, setPage] = useState(1);

  const params = {
    status: status || undefined,
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
          <h1 className="text-2xl font-bold text-stone-900">Agences</h1>
          <p className="mt-1 text-sm text-stone-600">
            Modération cross-tenant — vérification, suspension, retrait de vérification.
          </p>
        </div>
        <AgencyOnboardingDialog />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Rechercher (nom, slug, email)"
          className="min-w-64 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={createdFrom}
          onChange={(e) => {
            setCreatedFrom(e.target.value);
            setPage(1);
          }}
          aria-label="Créée à partir du"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={createdTo}
          onChange={(e) => {
            setCreatedTo(e.target.value);
            setPage(1);
          }}
          aria-label="Créée jusqu’au"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as (typeof SORT_OPTIONS)[number]['value']);
            setPage(1);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Tri"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="agencies-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900" role="alert">
          Erreur de chargement. {error?.displayMessage}
        </div>
      ) : !data || data.data.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-stone-500 ring-1 ring-stone-200">
          Aucune agence à afficher pour les filtres courants.
        </p>
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

function Pagination({
  page,
  lastPage,
  onChange,
}: {
  page: number;
  lastPage: number;
  onChange: (next: number) => void;
}) {
  if (lastPage <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-stone-600">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-md border border-stone-300 bg-white px-3 py-1 disabled:opacity-50"
      >
        Précédent
      </button>
      <span>
        Page {page} sur {lastPage}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(lastPage, page + 1))}
        disabled={page >= lastPage}
        className="rounded-md border border-stone-300 bg-white px-3 py-1 disabled:opacity-50"
      >
        Suivant
      </button>
    </div>
  );
}
