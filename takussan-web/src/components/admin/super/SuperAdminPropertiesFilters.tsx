'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { AgencyCombobox } from '@/components/admin/super/AgencyCombobox';
import { DebouncedSearchInput, FilterBar } from '@/components/console';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PROPERTY_ENUM_NAMESPACES,
  propertyStatusOptions,
  propertyTypeOptions,
  propertyVisibilityOptions,
} from '@/components/property-form/options';

const ALL = '__all__';

/** Les cinq paramètres d'URL qui portent un FILTRE — `page` et `sort` n'en sont pas. */
const PARAMS_DE_FILTRE = [
  'filter[search]',
  'filter[status]',
  'filter[type]',
  'filter[visibility]',
  'filter[agency_id]',
] as const;

interface SuperAdminPropertiesFiltersProps {
  /** Le compte de résultats du serveur, ou `undefined` tant qu'aucune réponse n'est arrivée. */
  total?: number;
  /** `true` quand la liste est en cours de rafraîchissement — alimente l'indicateur d'attente. */
  busy?: boolean;
}

/**
 * TCK-132 — filter bar for `/super-admin/properties`. All state is mirrored in
 * the URL query string (`?filter[search]=…&filter[status]=…&…`) so views are
 * shareable. Filtering is delegated to spatie/laravel-query-builder server-side
 * — never on the already-loaded page.
 *
 * TCK-363 — trois changements, tous mesurés sur l'écran :
 *
 * · Le sélecteur d'agence recevait 50 agences en prop (`fetchAdminAgencies({ perPage: 50 })`,
 *   émis au montage de la PAGE) et taisait tout ce qu'il ne montrait pas. `AgencyCombobox`
 *   cherche côté serveur et dit ce qu'il tronque.
 * · La recherche ne partait qu'à la touche Entrée, via un `<form onSubmit>` — donc à un geste
 *   que rien n'annonçait, et jamais si l'utilisateur cliquait ailleurs. Elle est maintenant
 *   temporisée à 300 ms comme les deux autres écrans.
 * · La barre porte le compte de résultats et « réinitialiser », qu'aucune barre de la console
 *   n'avait.
 */
export function SuperAdminPropertiesFilters({ total, busy }: SuperAdminPropertiesFiltersProps) {
  const t = useTranslations('superAdmin.properties.filters');
  const tFiltres = useTranslations('console.filterBar');
  // TCK-292 — les trois vocabulaires d'enum viennent du dictionnaire ; `property-form/options` ne
  // porte plus que l'espace de noms et la fabrique. Hooks posés AVANT toute sortie anticipée.
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tVisibility = useTranslations(PROPERTY_ENUM_NAMESPACES.visibility);
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get('filter[search]') ?? '';
  const currentStatus = searchParams.get('filter[status]') ?? '';
  const currentType = searchParams.get('filter[type]') ?? '';
  const currentVisibility = searchParams.get('filter[visibility]') ?? '';
  const currentAgency = searchParams.get('filter[agency_id]') ?? '';

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

  const filtresPoses = PARAMS_DE_FILTRE.some((cle) => (searchParams.get(cle) ?? '') !== '');
  const reinitialiser = useCallback(() => router.replace('?'), [router]);

  return (
    <FilterBar
      data-testid="super-admin-properties-filters"
      controlsClassName="md:grid-cols-2 xl:grid-cols-5"
      resultCount={total === undefined ? undefined : tFiltres('results', { count: total })}
      onReset={reinitialiser}
      resetLabel={tFiltres('reset')}
      resetDisabled={!filtresPoses}
    >
      <DebouncedSearchInput
        id="super-admin-properties-search"
        className="md:col-span-2"
        value={currentSearch}
        onCommit={(next) => updateParam('filter[search]', next || null)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchLabel')}
        busy={busy}
      />

      <AgencyCombobox
        value={currentAgency}
        onChange={(next) => updateParam('filter[agency_id]', next || null)}
        label={t('agency')}
      />
      <FilterSelect
        label={t('status')}
        value={currentStatus || ALL}
        onChange={(v) => updateParam('filter[status]', v === ALL ? null : v)}
        options={[{ value: ALL, label: t('allStatuses') }, ...propertyStatusOptions(tStatus)]}
      />
      <FilterSelect
        label={t('type')}
        value={currentType || ALL}
        onChange={(v) => updateParam('filter[type]', v === ALL ? null : v)}
        options={[{ value: ALL, label: t('allTypes') }, ...propertyTypeOptions(tType)]}
      />
      <FilterSelect
        label={t('visibility')}
        value={currentVisibility || ALL}
        onChange={(v) => updateParam('filter[visibility]', v === ALL ? null : v)}
        options={[{ value: ALL, label: t('allVisibilities') }, ...propertyVisibilityOptions(tVisibility)]}
      />
    </FilterBar>
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
    <Select value={value} onValueChange={(next) => onChange((next ?? ALL) as string)} items={options}>
      <SelectTrigger aria-label={label} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
