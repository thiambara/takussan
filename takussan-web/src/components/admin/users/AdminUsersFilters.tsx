'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'banned', label: 'Bloqué' },
];

const ROLE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'agency_admin', label: 'Administrateur' },
  { value: 'agent', label: 'Agent' },
  { value: 'owner', label: 'Bailleur' },
  { value: 'tenant', label: 'Locataire' },
  { value: 'customer', label: 'Client' },
  { value: 'service_provider', label: 'Prestataire' },
];

/**
 * TCK-133 — filter bar for `/admin/users` (agency_admin scope). All
 * state is mirrored in the URL query string so the page is shareable
 * and reload-safe. The agency scope itself is implicit — the backend
 * applies it from the active profile (TCK-141 / TCK-147), the frontend
 * never sends `filter[agency_id]`.
 */
export function AdminUsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get('filter[search]') ?? '';
  const currentStatus = searchParams.get('filter[status]') ?? '';
  const currentRole = searchParams.get('filter[role]') ?? '';

  const [searchInput, setSearchInput] = useState(currentSearch);

  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const onSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      updateParam('filter[search]', searchInput.trim() || null);
    },
    [searchInput, updateParam],
  );

  return (
    <div
      className="flex flex-col gap-3 rounded-xl bg-app-surface-1 p-4 md:flex-row md:items-center"
      data-testid="admin-users-filters"
    >
      <form onSubmit={onSearchSubmit} className="flex-1">
        <label htmlFor="admin-users-search" className="sr-only">
          Rechercher un utilisateur
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-ink-muted"
          />
          <input
            id="admin-users-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Rechercher (nom, email, téléphone)"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Statut"
          value={currentStatus || ALL}
          onChange={(v) => updateParam('filter[status]', v === ALL ? null : v)}
          options={[{ value: ALL, label: 'Tous statuts' }, ...STATUS_OPTIONS]}
        />
        <FilterSelect
          label="Rôle"
          value={currentRole || ALL}
          onChange={(v) => updateParam('filter[role]', v === ALL ? null : v)}
          options={[{ value: ALL, label: 'Tous rôles' }, ...ROLE_OPTIONS]}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col text-xs text-app-ink-muted">
      <span className="sr-only">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => onChange(next ?? '')}
        items={options}
      >
        <SelectTrigger className="min-w-40" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
