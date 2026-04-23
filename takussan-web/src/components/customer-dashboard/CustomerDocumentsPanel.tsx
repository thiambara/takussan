'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { FileText, Loader2, UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { uploadCustomerDocumentAction } from '@/app/actions/dashboard-customers';
import { CUSTOMER_DOCUMENT_ACCEPT } from '@/lib/queries/customers';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CustomerDocument } from '@/types/customer';

/**
 * Documents uploader + list — TCK-042.
 *
 * Client-side guards: max 10 Mo, images or PDF only (mirror of the server
 * validation in `uploadCustomerDocumentAction`). One file at a time to
 * keep the UI simple.
 */

interface CustomerDocumentsPanelProps {
  readonly customerId: number;
  readonly documents: CustomerDocument[];
}

export function CustomerDocumentsPanel({
  customerId,
  documents,
}: CustomerDocumentsPanelProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onPickFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    startTransition(async () => {
      const result = await uploadCustomerDocumentAction(customerId, formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-app-surface-1 p-4">
        <label
          htmlFor="customer-document-input"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-app-surface-3 px-4 py-6 text-center text-sm text-app-ink-muted transition-colors hover:border-app-accent/60"
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin text-app-accent" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-5 text-app-accent" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-app-ink">
            Téléverser un document
          </span>
          <span className="text-xs">
            Images ou PDF · 10 Mo maximum
          </span>
          <input
            id="customer-document-input"
            ref={inputRef}
            type="file"
            accept={CUSTOMER_DOCUMENT_ACCEPT}
            className="sr-only"
            disabled={pending}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {documents.length === 0 ? (
        <p className="rounded-xl bg-app-surface-1 px-4 py-6 text-center text-sm text-app-ink-muted">
          Aucun document associé.
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-app-surface-1 p-4"
            >
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-app-accent" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-app-ink">
                    {doc.name}
                  </p>
                  <p className="text-xs text-app-ink-muted">
                    {formatDateTime(doc.uploaded_at, locale)} ·{' '}
                    {(doc.size / (1024 * 1024)).toFixed(2)} Mo
                  </p>
                </div>
              </div>
              <Button
                render={
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    Ouvrir
                  </a>
                }
                variant="outline"
                size="sm"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
