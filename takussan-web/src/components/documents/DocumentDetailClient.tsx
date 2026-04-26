'use client';

import { ArrowLeft, FileText, Shield, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

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
  const { data, isLoading, isError } = useDocumentWithVersions(documentId);
  const document = data?.data;

  const isAdmin = currentUserRoles.includes('super_admin');
  const canManage =
    isAdmin || (currentUserId !== null && document?.uploaded_by === currentUserId);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-app-ink-muted">
        Chargement du document…
      </div>
    );
  }

  if (isError || !document) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        Document introuvable.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href="/app/documents"
        className="inline-flex items-center gap-1 text-sm text-app-ink-muted transition-colors hover:text-app-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Documents
      </Link>

      {/* Document card */}
      <div className="overflow-hidden rounded-xl border border-app-surface-3 bg-app-surface shadow-sm">
        {/* Header */}
        <div className="flex items-start gap-4 px-5 py-4">
          <FileText className="mt-0.5 size-8 shrink-0 text-app-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-app-ink">{document.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-app-ink-muted">
              {document.type ? <span className="capitalize">{document.type.replace(/_/g, ' ')}</span> : null}
              {document.expiry_date ? (
                <span>Expiration: {new Date(document.expiry_date).toLocaleDateString('fr-FR')}</span>
              ) : null}
            </div>
            {document.description ? (
              <p className="mt-2 text-sm text-app-ink-muted">{document.description}</p>
            ) : null}
          </div>
          {/* Verification badge */}
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              document.is_verified
                ? 'bg-green-500/10 text-green-600'
                : 'bg-app-surface-3 text-app-ink-muted'
            }`}
          >
            {document.is_verified ? (
              <ShieldCheck className="size-3" aria-hidden="true" />
            ) : (
              <Shield className="size-3" aria-hidden="true" />
            )}
            {document.is_verified ? 'Vérifié' : 'Non vérifié'}
          </span>
        </div>

        {/* Active version info */}
        {document.active_version ? (
          <div className="border-t border-app-surface-3 bg-app-surface-2 px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">
              Version active
            </p>
            <p className="mt-1 text-sm font-medium text-app-ink">
              v{document.active_version.version_number} — {document.active_version.file_name}
            </p>
            {document.active_version.comment ? (
              <p className="mt-0.5 text-xs italic text-app-ink-muted">
                &ldquo;{document.active_version.comment}&rdquo;
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
