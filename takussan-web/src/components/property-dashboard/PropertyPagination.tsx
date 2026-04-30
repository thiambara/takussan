'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PaginationMeta } from '@/types/api';

/**
 * Pagination control for dashboard lists. The current page lives in the URL
 * query string so filter + pagination state stays sharable.
 */

export function PropertyPagination({ meta }: { meta: PaginationMeta }) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  if (meta.last_page <= 1) return null;

  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="Pagination"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={meta.current_page <= 1}
        onClick={() => goTo(meta.current_page - 1)}
      >
        <ChevronLeft aria-hidden="true" />
        Précédent
      </Button>
      <span className="text-xs text-app-ink-muted">
        Page {meta.current_page} / {meta.last_page}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={meta.current_page >= meta.last_page}
        onClick={() => goTo(meta.current_page + 1)}
      >
        Suivant
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
