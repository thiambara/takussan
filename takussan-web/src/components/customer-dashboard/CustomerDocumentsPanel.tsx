'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/feedback';

import { Button } from '@/components/ui/button';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { BasculeDeVisibilite, PastilleInterne } from '@/components/documents/VisibiliteDuDocument';
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
 *
 * TCK-2759 (ADR-0099, amendement du 2026-11-12) — la pastille « Interne » et la bascule de visibilité,
 * sur le verdict que l'API sert à la ligne (`abilities.set_visibility`). La ligne lit ce que
 * `CustomerResource` sert : nom, type, date — ni taille ni URL de fichier (le panneau lisait
 * `uploaded_at`, `size` et `url`, qu'aucune réponse ne portait) ; « Ouvrir » mène à la page du document.
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
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {doc.name}
                    </p>
                    {doc.is_internal ? <PastilleInterne /> : null}
                  </div>
                  {doc.created_at ? (
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(doc.created_at, locale)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {doc.abilities?.set_visibility ? (
                  <BasculeDeVisibilite
                    documentId={doc.id}
                    nom={doc.name}
                    interne={doc.is_internal === true}
                    onChange={() => router.refresh()}
                  />
                ) : null}
                <Button
                  nativeButton={false}
                  render={<Link href={`/app/documents/${doc.id}`}>{t('open')}</Link>}
                  variant="outline"
                  size="sm"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
