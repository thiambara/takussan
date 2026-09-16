'use client';

import { ArrowLeft, FileText, Shield, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import { formatDate } from '@/lib/format';
import type { DocumentType } from '@/types/document';

import { DOCUMENT_TYPE_ORDER } from './constants';

import { DocumentVersionsList } from '@/components/documents/DocumentVersionsList';
import { useDocumentWithVersions } from '@/lib/queries/documents';
import type { UserRole } from '@/types/user';

interface DocumentDetailClientProps {
  readonly documentId: number;
  readonly currentUserId: number | null;
  readonly currentUserRoles: readonly UserRole[];
}

/**
 * Client component for the document detail page.
 * Shows document metadata and the version history accordion.
 */
export function DocumentDetailClient({
  documentId,
  currentUserId,
  currentUserRoles,
}: DocumentDetailClientProps) {
  const t = useTranslations('documents.detail');
  const tTypes = useTranslations('documents.types');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const documentQuery = useDocumentWithVersions(documentId);
  const { data, isLoading, isError } = documentQuery;
  const document = data?.data;

  const isAdmin = currentUserRoles.includes('super_admin');
  const canManage =
    isAdmin || (currentUserId !== null && document?.uploaded_by === currentUserId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
        <span className="sr-only">{t('loading')}</span>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  if (isError || !document) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          message={t('not_found')}
          onRetry={() => void documentQuery.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href="/app/documents"
        className="-my-1 inline-flex min-h-8 items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>

      {/* Document card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
          <FileText className="mt-0.5 size-8 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="font-display text-xl font-semibold tracking-tight break-words text-balance text-foreground">
              {document.name}
            </h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {document.type ? (
                <span>
                  {DOCUMENT_TYPE_ORDER.includes(document.type as DocumentType)
                    ? tTypes(document.type)
                    : document.type}
                </span>
              ) : null}
              {document.expiry_date ? (
                <span>
                  {t('expiry', {
                    date: formatDate(document.expiry_date, locale),
                  })}
                </span>
              ) : null}
            </div>
            {document.description ? (
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                {document.description}
              </p>
            ) : null}
          </div>
          {/* Verification badge */}
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
              document.is_verified
                ? 'bg-success/10 text-success'
                : 'bg-border text-muted-foreground'
            }`}
          >
            {document.is_verified ? (
              <ShieldCheck className="size-3" aria-hidden="true" />
            ) : (
              <Shield className="size-3" aria-hidden="true" />
            )}
            {document.is_verified ? t('verified') : t('not_verified')}
          </span>
        </div>

        {/* Active version info */}
        {document.active_version ? (
          <div className="border-t border-border bg-muted px-4 py-3 sm:px-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('active_version')}
            </p>
            <p className="mt-1 text-sm font-medium break-words text-foreground">
              v{document.active_version.version_number} — {document.active_version.file_name}
            </p>
            {document.active_version.comment ? (
              <p className="mt-0.5 text-xs italic text-muted-foreground">
                {t('comment_quoted', { comment: document.active_version.comment })}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Version history accordion */}
        <DocumentVersionsList
          documentId={documentId}
          canManage={canManage}
          defaultOpen={true}
        />
      </div>
    </div>
  );
}
