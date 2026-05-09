'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  readonly page: number;
  readonly lastPage: number;
  readonly onChange: (next: number) => void;
  readonly className?: string;
}

export function Pagination({ page, lastPage, onChange, className }: PaginationProps) {
  if (lastPage <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={
        'flex items-center justify-between gap-3 text-sm text-muted-foreground' +
        (className ? ` ${className}` : '')
      }
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        <ChevronLeft aria-hidden />
        Précédent
      </Button>
      <span aria-live="polite">
        Page {page} sur {lastPage}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => onChange(Math.min(lastPage, page + 1))}
      >
        Suivant
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
