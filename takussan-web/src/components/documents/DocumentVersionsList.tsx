'use client';

import { useState, useCallback, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ChevronDown,
  ChevronUp,
  Download,
  History,
  RotateCcw,
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  Clock,
} from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useDocumentVersions,
  useRestoreDocumentVersion,
  useUploadDocumentVersion,
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_MIME_ACCEPT,
} from '@/lib/queries/documents';
import type { DocumentVersion } from '@/types/document';
import type { Locale } from '@/i18n/config';
import { formatDateTime } from '@/lib/format';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return '—';
  return formatDateTime(iso, locale);
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload version modal
// ─────────────────────────────────────────────────────────────────────────────

interface UploadVersionModalProps {
  readonly open: boolean;
  readonly documentId: number;
  readonly onOpenChange: (open: boolean) => void;
}

function UploadVersionModal({ open, documentId, onOpenChange }: UploadVersionModalProps) {
  const t = useTranslations('documents.versions');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useUploadDocumentVersion();

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = list[0];
    if (picked.size > DOCUMENT_MAX_SIZE_BYTES) {
      setFileError(t('too_large'));
      return;
    }
    setFileError(null);
    setFile(picked);
  }, [t]);

  const reset = useCallback(() => {
    setFile(null);
    setComment('');
    setFileError(null);
  }, []);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setFileError(t('select_file_error'));
      return;
    }
    await upload.mutateAsync({ document_id: documentId, file, comment: comment || undefined });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('add_title')}</DialogTitle>
          <DialogDescription>{t('add_description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {upload.error ? (
            <p role="alert" className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {messageErreur(upload.error, t('generic_error'))}
            </p>
          ) : null}

          {/* File drop zone */}
          <label
            htmlFor="version-upload-input"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60"
          >
            {file ? (
              <>
                <FileText className="size-6 text-primary" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{file.name}</span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    aria-label={t('remove_file_aria')}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-xs">{formatBytes(file.size)}</span>
              </>
            ) : (
              <>
                <UploadCloud className="size-6 text-primary" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">
                  {t('dropzone_title')}
                </span>
                <span className="text-xs">{t('dropzone_hint')}</span>
              </>
            )}
            <input
              id="version-upload-input"
              ref={inputRef}
              type="file"
              accept={DOCUMENT_MIME_ACCEPT}
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          {fileError ? (
            <p role="alert" className="text-xs text-destructive">
              {fileError}
            </p>
          ) : null}

          {/* Comment */}
          <div className="space-y-1">
            <label
              htmlFor="version-comment"
              className="block text-sm font-medium text-foreground"
            >
              {t('comment_label')}{' '}
              <span className="text-muted-foreground">{t('comment_optional')}</span>
            </label>
            <textarea
              id="version-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t('comment_placeholder')}
              className="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={upload.isPending || !file}>
              {upload.isPending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore confirm dialog
// ─────────────────────────────────────────────────────────────────────────────

interface RestoreConfirmProps {
  readonly open: boolean;
  readonly version: DocumentVersion | null;
  readonly documentId: number;
  readonly onOpenChange: (open: boolean) => void;
}

function RestoreConfirmDialog({ open, version, documentId, onOpenChange }: RestoreConfirmProps) {
  const t = useTranslations('documents.versions');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const restore = useRestoreDocumentVersion();

  const handleConfirm = async () => {
    if (!version) return;
    await restore.mutateAsync({ document_id: documentId, version_id: version.id });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('restore_title', { version: version?.version_number ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t.rich('restore_body', {
              name: version?.file_name ?? '',
              nom: (chunks) => (
                <span className="font-medium text-foreground">{chunks}</span>
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        {restore.error ? (
          <p role="alert" className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {messageErreur(restore.error, t('restore_error'))}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={restore.isPending}
          >
            {restore.isPending ? t('restoring') : tCommon('actions.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Version row
// ─────────────────────────────────────────────────────────────────────────────

interface VersionRowProps {
  readonly version: DocumentVersion;
  readonly canManage: boolean;
  readonly onRestoreClick: (v: DocumentVersion) => void;
}

function VersionRow({ version, canManage, onRestoreClick }: VersionRowProps) {
  const t = useTranslations('documents.versions');
  const locale = useLocale() as Locale;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3">
      {/* Version badge */}
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
        v{version.version_number}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground" title={version.file_name}>
            {version.file_name}
          </span>
          {version.is_active ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              {t('active')}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {formatDate(version.created_at, locale)}
          </span>
          <span>{formatBytes(version.size)}</span>
          {version.comment ? (
            <span className="italic">
              {t('comment_quoted', { comment: version.comment })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {version.url ? (
          <a
            href={version.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('download_aria')}
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        ) : null}
        {canManage && !version.is_active ? (
          <button
            type="button"
            onClick={() => onRestoreClick(version)}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('restore_aria', { version: version.version_number })}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentVersionsListProps {
  /** The document ID to manage versions for. */
  readonly documentId: number;
  /**
   * Whether the current user is allowed to upload or restore versions.
   * When false, only download links are shown.
   */
  readonly canManage?: boolean;
  /** Show the panel expanded by default. */
  readonly defaultOpen?: boolean;
}

/**
 * Accordion-style version history panel for a document.
 * Renders an inline expandable list of versions (latest first) with
 * upload-new-version and restore-version actions.
 */
export function DocumentVersionsList({
  documentId,
  canManage = false,
  defaultOpen = false,
}: DocumentVersionsListProps) {
  const t = useTranslations('documents.versions');
  const tCommon = useTranslations('common');
  const [expanded, setExpanded] = useState(defaultOpen);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DocumentVersion | null>(null);

  const versionsQuery = useDocumentVersions(expanded ? documentId : null);
  const { data, isLoading, isError } = versionsQuery;

  const versions: DocumentVersion[] = data?.data ?? [];
  const count = versions.length;

  return (
    <>
      {/* Accordion trigger — le bouton « Nouvelle version » vivait DANS le bouton d'accordéon :
          un <button> dans un <button> est du HTML invalide, React le signale en erreur
          d'hydratation et la page de détail tombait dans la frontière d'erreur. */}
      <div className="flex items-center gap-2 border-t border-border pr-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-expanded={expanded}
        >
          <History className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1">
            {t('heading')}
            {count > 0 ? (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
                {count}
              </span>
            ) : null}
          </span>
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setUploadOpen(true)}
            aria-label={t('add_title')}
            className="shrink-0"
          >
            <UploadCloud aria-hidden="true" />
            {t('new_version')}
          </Button>
        ) : null}
      </div>

      {/* Expanded content */}
      {expanded ? (
        <div className="px-4 pb-4">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {tCommon('status.loading')}
            </p>
          ) : isError ? (
            <ErrorState
              message={t('error')}
              onRetry={() => void versionsQuery.refetch()}
              retryLabel={tCommon('actions.retry')}
            />
          ) : versions.length === 0 ? (
            <EmptyState
              icon={<History className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
              action={
                canManage ? (
                  <Button type="button" variant="outline" onClick={() => setUploadOpen(true)}>
                    {t('empty_cta')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2 pt-1" aria-label={t('list_aria')}>
              {versions.map((v) => (
                <VersionRow
                  key={v.id}
                  version={v}
                  canManage={canManage}
                  onRestoreClick={setRestoreTarget}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Modals */}
      <UploadVersionModal
        open={uploadOpen}
        documentId={documentId}
        onOpenChange={setUploadOpen}
      />
      <RestoreConfirmDialog
        open={restoreTarget !== null}
        version={restoreTarget}
        documentId={documentId}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      />
    </>
  );
}
