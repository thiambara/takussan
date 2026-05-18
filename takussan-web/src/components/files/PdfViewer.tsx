'use client';

import { Download, FileText } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-268 — Reusable, dependency-free PDF / image preview.
 *
 * Designed for the super-admin upgrade review console: super-admins need
 * to glance at a `statuts` scan without leaving the detail page. We
 * intentionally avoid a heavy lib (pdf.js / react-pdf) — the browser's
 * built-in viewer is good enough for first-pass triage and downloads
 * remain a one-click escape hatch.
 *
 * Falls back to a download-only card when no URL is available.
 */
export interface PdfViewerProps {
  readonly url: string | null;
  readonly filename?: string | null;
  readonly className?: string;
  readonly height?: number;
}

export function PdfViewer({ url, filename, className, height = 480 }: PdfViewerProps) {
  if (!url) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600',
          className,
        )}
        role="status"
      >
        <FileText className="size-5 shrink-0 text-stone-400" aria-hidden="true" />
        <span>Aucun fichier joint.</span>
      </div>
    );
  }

  const safeName = filename ?? 'document';

  return (
    <div className={cn('overflow-hidden rounded-lg border border-stone-200', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-stone-700">
          <FileText className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span className="truncate">{safeName}</span>
        </div>
        <a
          href={url}
          download={safeName}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Download className="mr-1 size-3.5" aria-hidden="true" />
          Télécharger
        </a>
      </header>
      <object
        data={url}
        type="application/pdf"
        className="block w-full bg-white"
        style={{ height }}
        aria-label={`Aperçu de ${safeName}`}
      >
        <div className="flex h-40 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-stone-600">
          <p>Aperçu indisponible dans ce navigateur.</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Ouvrir le fichier
          </a>
        </div>
      </object>
    </div>
  );
}
