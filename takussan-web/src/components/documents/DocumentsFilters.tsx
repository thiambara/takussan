'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DocumentType } from '@/types/document';

import {
  DOCUMENT_TYPE_ORDER,
  DOCUMENTABLE_FILTER_ORDER,
} from './constants';

const ANY_VALUE = '__any__';

export function DocumentsFilters() {
  const t = useTranslations('documents.filters');
  const tTypes = useTranslations('documents.types');
  const tEntities = useTranslations('documents.entities');
  const router = useRouter();
  const searchParams = useSearchParams();

  const typeItems = useMemo(
    () => [
      { value: ANY_VALUE, label: t('all_types') },
      ...DOCUMENT_TYPE_ORDER.map((value) => ({ value, label: tTypes(value) })),
    ],
    [t, tTypes],
  );

  const entityItems = useMemo(
    () => [
      { value: ANY_VALUE, label: t('all_entities') },
      ...DOCUMENTABLE_FILTER_ORDER.map((value) => ({ value, label: tEntities(value) })),
    ],
    [t, tEntities],
  );

  const currentSearch = searchParams.get('search') ?? '';
  const currentType = searchParams.get('type') ?? ANY_VALUE;
  const currentEntity = searchParams.get('documentable_type') ?? ANY_VALUE;

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ANY_VALUE) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
      <div>
        <label htmlFor="documents-search" className="sr-only">
          {t('search_label')}
        </label>
        <Input
          id="documents-search"
          type="search"
          placeholder={t('search_placeholder')}
          defaultValue={currentSearch}
          onBlur={(e) => update('search', e.currentTarget.value.trim() || null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              update('search', e.currentTarget.value.trim() || null);
            }
          }}
        />
      </div>
      <div>
        <label htmlFor="documents-type" className="sr-only">
          {t('type_label')}
        </label>
        <Select
          value={currentType}
          onValueChange={(v) => update('type', v === ANY_VALUE ? null : v)}
          items={typeItems}
        >
          <SelectTrigger id="documents-type" className="w-full">
            <SelectValue placeholder={t('all_types')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>{t('all_types')}</SelectItem>
            {DOCUMENT_TYPE_ORDER.map((value) => (
              <SelectItem key={value} value={value as DocumentType}>
                {tTypes(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label htmlFor="documents-entity" className="sr-only">
          {t('entity_label')}
        </label>
        <Select
          value={currentEntity}
          onValueChange={(v) =>
            update('documentable_type', v === ANY_VALUE ? null : v)
          }
          items={entityItems}
        >
          <SelectTrigger id="documents-entity" className="w-full">
            <SelectValue placeholder={t('all_entities')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>{t('all_entities')}</SelectItem>
            {DOCUMENTABLE_FILTER_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {tEntities(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
