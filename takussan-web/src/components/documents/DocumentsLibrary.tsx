'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  FileText,
  Share2,
  Trash2,
  UploadCloud,
  Download,
  AlertCircle,
  History,
  Plus,
  Home,
  FileCheck2,
} from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/useAuth';
import { isOwner } from '@/lib/roles';
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
  DOCUMENT_TYPE_ORDER,
  resolveDocumentableAlias,
  resolveDocumentableHref,
} from './constants';
import { DocumentShareDialog } from './DocumentShareDialog';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { DocumentsFilters } from './DocumentsFilters';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function DocumentsLibrary() {
  const locale = useLocale() as Locale;
  const t = useTranslations('documents.library');
  const tTypes = useTranslations('documents.types');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
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
      // `type`, et non `t` : `t` est désormais la fonction de traduction du composant.
      const type = (doc.type ?? 'other') as DocumentType;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(doc);
    }
    return Array.from(groups.entries()).sort(
      (a, b) => DOCUMENT_TYPE_ORDER.indexOf(a[0]) - DOCUMENT_TYPE_ORDER.indexOf(b[0]),
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
          messageErreur(e, t('delete_error')),
        );
      }
    },
    [deleteDocument, t, messageErreur],
  );

  const totalFromMeta = data?.meta?.total ?? 0;
  const ownerEmptyState = user ? isOwner(user.roles) : false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-app-ink-muted">
            {isLoading
              ? tCommon('status.loading')
              : t('count', { count: totalFromMeta })}
          </p>
        </div>
        <Button type="button" onClick={() => setUploadOpen(true)}>
          <Plus className="mr-1 size-4" aria-hidden="true" />
          {t('upload_cta')}
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
          <ErrorState
            icon={<AlertCircle className="size-4" aria-hidden="true" />}
            message={messageErreur(error, t('error'))}
          />
        ) : grouped.length === 0 ? (
          <DocumentsEmpty
            onUpload={() => setUploadOpen(true)}
            dragOver={dragOver}
            owner={ownerEmptyState}
          />
        ) : (
          <div className="space-y-5">
            {deleteError ? <ErrorState message={deleteError} /> : null}
            {grouped.map(([category, docs]) => (
              <section key={category}>
                <header className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-app-ink">
                    {tTypes(category)}
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

/**
 * ⚠ Ce cas n'est PAS mécanique, et c'est le NOM qui le disait mal.
 *
 * La branche `owner && !dragOver` rend une grille d'exemples de catégories ET une liste de cibles
 * de rattachement (bien / bail / profil). Ce n'est pas un état vide : c'est un MODE D'EMPLOI qui
 * s'affiche quand c'est vide. Le forcer dans `{icon, title, description, action}` détruirait de la
 * fonctionnalité — mais le laisser s'appeler `OwnerEmptyState` faisait passer pour un neuvième
 * duplicata d'`EmptyState` un composant d'un autre genre, et lui valait une ligne dans
 * l'allowlist de `scripts/check-feedback-states.mjs`.
 *
 * Il s'appelle donc `OwnerDocumentsPrimer` (TCK-291), et l'allowlist est vide. Le geste qui ferme
 * la ligne est le renommage, pas un `--` sur le plafond de la garde.
 */
function DocumentsEmpty({
  onUpload,
  dragOver,
  owner,
}: {
  readonly onUpload: () => void;
  readonly dragOver: boolean;
  readonly owner: boolean;
}) {
  const t = useTranslations('documents.library');

  if (owner && !dragOver) {
    return <OwnerDocumentsPrimer onUpload={onUpload} />;
  }

  return (
    <EmptyState
      icon={<UploadCloud className="size-8" aria-hidden="true" />}
      title={dragOver ? t('drop_title') : t('empty_title')}
      description={dragOver ? t('drop_description') : t('empty_description')}
      action={
        dragOver ? undefined : (
          <Button type="button" variant="outline" onClick={onUpload}>
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t('upload_cta')}
          </Button>
        )
      }
    />
  );
}

function OwnerDocumentsPrimer({ onUpload }: { readonly onUpload: () => void }) {
  const t = useTranslations('documents.primer');
  const tLibrary = useTranslations('documents.library');
  const tTypes = useTranslations('documents.types');
  const tEntities = useTranslations('documents.entities');

  const examples = [
    { label: t('examples.land_title'), type: tTypes('other') },
    { label: t('examples.signed_lease'), type: tTypes('lease_contract') },
    { label: t('examples.receipt'), type: tTypes('receipt') },
    { label: t('examples.invoice'), type: tTypes('invoice') },
    { label: t('examples.owner_id'), type: tTypes('id_card') },
  ] as const;

  const targets = [
    { icon: Home, title: tEntities('property'), helper: t('targets.property_helper') },
    { icon: FileText, title: tEntities('lease'), helper: t('targets.lease_helper') },
    { icon: FileCheck2, title: tEntities('user'), helper: t('targets.user_helper') },
  ] as const;

  return (
    <div className="rounded-xl bg-app-surface-1 px-5 py-6 text-sm text-app-ink">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <UploadCloud className="size-6 text-app-accent" aria-hidden="true" />
            <h2 className="text-base font-semibold">{t('title')}</h2>
          </div>
          <p className="mt-2 text-app-ink-muted">{t('body')}</p>
        </div>
        <Button type="button" onClick={onUpload} className="shrink-0">
          <Plus className="mr-1 size-4" aria-hidden="true" />
          {tLibrary('upload_cta')}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
            {t('examples_heading')}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((example) => (
              <span
                key={example.label}
                className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-app-ink"
              >
                {example.label} · {example.type}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
            {t('targets_heading')}
          </h3>
          <div className="mt-2 grid gap-2">
            {targets.map((target) => {
              const Icon = target.icon;
              return (
                <div key={target.title} className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white p-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-app-accent" aria-hidden="true" />
                  <div>
                    <p className="font-medium">{target.title}</p>
                    <p className="text-xs text-app-ink-muted">{target.helper}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
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
  const t = useTranslations('documents.library');
  const tEntities = useTranslations('documents.entities');
  const alias = resolveDocumentableAlias(doc.documentable_type);
  const href = alias ? resolveDocumentableHref(alias, doc.documentable_id) : null;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 text-sm">
      <FileText className="size-5 shrink-0 text-app-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-app-ink">{doc.name}</span>
          {doc.is_verified ? <Badge variant="secondary">{t('verified')}</Badge> : null}
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
                  {tEntities(alias)} #{doc.documentable_id}
                </Link>
              ) : (
                <span>
                  {tEntities(alias)} #{doc.documentable_id}
                </span>
              )}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* Versions link — TCK-097 */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <Link href={`/app/documents/${doc.id}`}>
              <History className="mr-1 size-4" aria-hidden="true" />
              {t('versions')}
            </Link>
          }
        />
        {doc.file_url ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1 size-4" aria-hidden="true" />
                {t('download')}
              </a>
            }
          />
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onShare}>
          <Share2 className="mr-1 size-4" aria-hidden="true" />
          {t('share')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={deleting}
          aria-label={t('delete_aria')}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
