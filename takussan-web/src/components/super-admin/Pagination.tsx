'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  readonly page: number;
  readonly lastPage: number;
  readonly onChange: (next: number) => void;
  readonly className?: string;
}

export function Pagination({ page, lastPage, onChange, className }: PaginationProps) {
  // Le hook se place AVANT la sortie anticipée : après, ce serait un hook conditionnel,
  // que le React Compiler (ADR-0015) refuse.
  const t = useTranslations('superAdmin.pages.pagination');

  if (lastPage <= 1) return null;

  return (
    <nav
      aria-label={t('aria')}
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
        {t('previous')}
      </Button>
      <span aria-live="polite">
        {t('position', { page: String(page), lastPage: String(lastPage) })}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => onChange(Math.min(lastPage, page + 1))}
      >
        {t('next')}
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
