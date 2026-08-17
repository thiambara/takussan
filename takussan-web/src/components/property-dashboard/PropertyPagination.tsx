'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PaginationMeta } from '@/types/api';
import { useTranslations } from 'next-intl';

/**
 * Pagination control for dashboard lists. The current page lives in the URL
 * query string so filter + pagination state stays sharable.
 */

const PER_PAGE_OPTIONS = ['10', '20', '50'] as const;

export function PropertyPagination({ meta }: { meta: PaginationMeta }) {
  const t = useTranslations('property.dashboard.pagination');
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPerPage = String(meta.per_page ?? 20);

  const goTo = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setPerPage = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === '20') {
        params.delete('per_page');
      } else {
        params.set('per_page', value);
      }
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const items = PER_PAGE_OPTIONS.map((v) => ({ value: v, label: `${v} / page` }));

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label={t('aria')}
    >
      <div className="flex items-center gap-3 text-xs text-app-ink-muted">
        <span>
          {t('pageOf', {
            current: meta.current_page,
            total: Math.max(meta.last_page, 1),
          })}{' '}
          · {t('results', { count: meta.total })}
        </span>
        <div className="hidden sm:block">
          <Select
            value={currentPerPage}
            onValueChange={(v) => setPerPage((v ?? '20') as string)}
            items={items}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder={t('perPagePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {items.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={meta.current_page <= 1}
          onClick={() => goTo(meta.current_page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          {t('previous')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={meta.current_page >= meta.last_page}
          onClick={() => goTo(meta.current_page + 1)}
        >
          {t('next')}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
