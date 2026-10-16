'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/feedback';

import { Button } from '@/components/ui/button';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CustomerDocument } from '@/types/customer';

/**
 * Onglet Documents de la fiche client — TCK-042.
 *
 * Le dépôt passe par `AddDocumentButton`, donc par `POST /api/documents` avec
 * `documentable_type=customer` (TCK-700) : le panneau postait sur `/api/customers/{id}/documents`,
 * qu'aucune route ne sert. La liste vient du rendu serveur de la fiche (`include=documents`),
 * d'où le `router.refresh()` après un dépôt.
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
  const t = useTranslations('crm.customerDetail.documents');

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <AddDocumentButton
          documentableType="customer"
          documentableId={customerId}
          onUploaded={() => router.refresh()}
        />
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {doc.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(doc.uploaded_at, locale)} ·{' '}
                    {t('sizeMb', { size: (doc.size / (1024 * 1024)).toFixed(2) })}
                  </p>
                </div>
              </div>
              <Button
                render={
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    {t('open')}
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
