'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  FileText,
  Share2,
  Trash2,
  UploadCloud,
  Download,
  AlertCircle,
  Plus,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  useDeleteDocument,
  useDocuments,
  type UseDocumentsParams,
} from '@/lib/queries/documents';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import type { Locale } from '@/i18n/config';
import type { Document, DocumentType, DocumentableType } from '@/types/document';

import {
  DOCUMENT_TYPE_LABEL,
  DOCUMENTABLE_TYPE_LABEL,
  resolveDocumentableAlias,
  resolveDocumentableHref,
} from './constants';
import { DocumentShareDialog } from './DocumentShareDialog';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { DocumentsFilters } from './DocumentsFilters';

const CATEGORY_ORDER: readonly DocumentType[] = [
  'lease_contract',
  'invoice',
  'receipt',
  'id_card',
  'passport',
  'insurance',
  'inventory_report',
  'photo',
  'other',
];

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function DocumentsLibrary() {
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const params: UseDocumentsParams = useMemo(() => {
    const search = searchParams.get('search') ?? undefined;
    const type = (searchParams.get('type') as DocumentType | null) ?? undefined;
    const documentable_type =
      (searchParams.get('documentable_type') as DocumentableType | null) ?? undefined;
    return {
      page,
      per_page: 30,
      search: search || undefined,
      type: type || undefined,
      documentable_type: documentable_type || undefined,
    };
  }, [page, searchParams]);

  const { data, isLoading, isError, error } = useDocuments(params);
  const deleteDocument = useDeleteDocument();

  const grouped = useMemo(() => {
    const list = data?.data ?? [];
    const groups = new Map<DocumentType, Document[]>();
    for (const doc of list) {
      const t = (doc.type ?? 'other') as DocumentType;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(doc);
    }
    return Array.from(groups.entries()).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    );
  }, [data]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      if (event.dataTransfer.files?.length) {
        setUploadOpen(true);
      }
    },
    [],
  );

  const onDelete = useCallback(
    async (docId: number) => {
      setDeleteError(null);
      try {
        await deleteDocument.mutateAsync({ id: docId });
      } catch (e) {
        setDeleteError(
          e instanceof ApiError ? e.displayMessage : 'Suppression impossible.',
        );
      }
    },
    [deleteDocument],
  );

  const totalFromMeta = data?.meta?.total ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-app-ink-muted">
            {isLoading ? 'Chargement…' : `${totalFromMeta} document(s)`}
          </p>
        </div>
        <Button type="button" onClick={() => setUploadOpen(true)}>
          <Plus className="mr-1 size-4" aria-hidden="true" />
          Ajouter un document
        </Button>
      </div>

      <DocumentsFilters />

      <div
        ref={dropZoneRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          'rounded-xl border border-dashed p-2 transition-colors',
          dragOver
            ? 'border-app-accent bg-app-accent/5'
            : 'border-transparent',
        ].join(' ')}
      >
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-app-surface-1" />
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
            <AlertCircle className="mr-2 inline size-4" aria-hidden="true" />
            {error instanceof ApiError ? error.displayMessage : 'Impossible de charger les documents.'}
          </p>
        ) : grouped.length === 0 ? (
          <EmptyState onUpload={() => setUploadOpen(true)} dragOver={dragOver} />
        ) : (
          <div className="space-y-5">
            {deleteError ? (
              <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                {deleteError}
              </p>
            ) : null}
            {grouped.map(([category, docs]) => (
              <section key={category}>
                <header className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-app-ink">
                    {DOCUMENT_TYPE_LABEL[category]}
                  </h2>
                  <Badge variant="secondary">{docs.length}</Badge>
                </header>
                <ul className="space-y-2">
                  {docs.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      locale={locale}
                      onShare={() => setShareDoc(doc)}
                      onDelete={() => void onDelete(doc.id)}
                      deleting={deleteDocument.isPending}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {data?.meta ? (
        <PropertyPagination meta={data.meta} />
      ) : null}

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <DocumentShareDialog
        open={shareDoc !== null}
        onOpenChange={(open) => {
          if (!open) setShareDoc(null);
        }}
        document={shareDoc}
      />
    </div>
  );
}

function EmptyState({
  onUpload,
  dragOver,
}: {
  readonly onUpload: () => void;
  readonly dragOver: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-app-surface-1 px-6 py-12 text-center text-sm text-app-ink-muted">
      <UploadCloud className="size-8 text-app-accent" aria-hidden="true" />
      <p className="max-w-md">
        {dragOver
          ? 'Relâchez pour téléverser ce fichier.'
          : 'Aucun document pour le moment. Glissez-déposez un fichier ou utilisez le bouton ci-dessous.'}
      </p>
      <Button type="button" variant="outline" onClick={onUpload}>
        <Plus className="mr-1 size-4" aria-hidden="true" />
        Téléverser un document
      </Button>
    </div>
  );
}

interface DocumentRowProps {
  readonly doc: Document;
  readonly locale: Locale;
  readonly onShare: () => void;
  readonly onDelete: () => void;
  readonly deleting: boolean;
}

function DocumentRow({ doc, locale, onShare, onDelete, deleting }: DocumentRowProps) {
  const alias = resolveDocumentableAlias(doc.documentable_type);
  const href = alias ? resolveDocumentableHref(alias, doc.documentable_id) : null;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 text-sm">
      <FileText className="size-5 shrink-0 text-app-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-app-ink">{doc.name}</span>
          {doc.is_verified ? <Badge variant="secondary">Vérifié</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-app-ink-muted">
          {formatFileSize(doc.file_size)}
          {doc.mime_type ? <> · {doc.mime_type}</> : null}
          {doc.created_at ? <> · {formatDateTime(doc.created_at, locale)}</> : null}
          {alias ? (
            <>
              {' · '}
              {href ? (
                <Link href={href} className="underline-offset-2 hover:underline">
                  {DOCUMENTABLE_TYPE_LABEL[alias]} #{doc.documentable_id}
                </Link>
              ) : (
                <span>
                  {DOCUMENTABLE_TYPE_LABEL[alias]} #{doc.documentable_id}
                </span>
              )}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {doc.file_url ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            render={
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1 size-4" aria-hidden="true" />
                Télécharger
              </a>
            }
          />
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onShare}>
          <Share2 className="mr-1 size-4" aria-hidden="true" />
          Partager
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Supprimer"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
