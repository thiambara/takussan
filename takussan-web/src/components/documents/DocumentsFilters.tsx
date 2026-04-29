'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DocumentType, DocumentableType } from '@/types/document';

import {
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENTABLE_TYPE_LABEL,
} from './constants';

const DOCUMENTABLE_FILTER_OPTIONS: readonly { value: DocumentableType; label: string }[] = [
  { value: 'property', label: DOCUMENTABLE_TYPE_LABEL.property },
  { value: 'lease', label: DOCUMENTABLE_TYPE_LABEL.lease },
  { value: 'booking', label: DOCUMENTABLE_TYPE_LABEL.booking },
  { value: 'customer', label: DOCUMENTABLE_TYPE_LABEL.customer },
  { value: 'inventory', label: DOCUMENTABLE_TYPE_LABEL.inventory },
  { value: 'agency', label: DOCUMENTABLE_TYPE_LABEL.agency },
];

const ANY_VALUE = '__any__';

export function DocumentsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
          Recherche
        </label>
        <Input
          id="documents-search"
          type="search"
          placeholder="Rechercher par nom, description…"
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
          Catégorie
        </label>
        <Select
          value={currentType}
          onValueChange={(v) => update('type', v === ANY_VALUE ? null : v)}
        >
          <SelectTrigger id="documents-type" className="w-full">
            <SelectValue placeholder="Toutes catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>Toutes catégories</SelectItem>
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value as DocumentType}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label htmlFor="documents-entity" className="sr-only">
          Type d&apos;entité
        </label>
        <Select
          value={currentEntity}
          onValueChange={(v) =>
            update('documentable_type', v === ANY_VALUE ? null : v)
          }
        >
          <SelectTrigger id="documents-entity" className="w-full">
            <SelectValue placeholder="Toutes entités" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>Toutes entités</SelectItem>
            {DOCUMENTABLE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
