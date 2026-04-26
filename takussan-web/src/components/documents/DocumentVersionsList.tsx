'use client';

import { useState, useCallback, useRef } from 'react';
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useUploadDocumentVersion();

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = list[0];
    if (picked.size > DOCUMENT_MAX_SIZE_BYTES) {
      setFileError('Le fichier dépasse 10 Mo.');
      return;
    }
    setFileError(null);
    setFile(picked);
  }, []);

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
      setFileError('Veuillez sélectionner un fichier.');
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
          <DialogTitle>Ajouter une version</DialogTitle>
          <DialogDescription>
            La version précédente sera archivée mais restera accessible dans
            l&apos;historique.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {upload.error ? (
            <p role="alert" className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {upload.error.message ?? 'Une erreur est survenue.'}
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
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-app-surface-3 px-4 py-6 text-center text-sm text-app-ink-muted transition-colors hover:border-app-accent/60"
          >
            {file ? (
              <>
                <FileText className="size-6 text-app-accent" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-app-ink">{file.name}</span>
                  <button
                    type="button"
                    className="text-xs text-app-ink-muted hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    aria-label="Retirer le fichier"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-xs">{formatBytes(file.size)}</span>
              </>
            ) : (
              <>
                <UploadCloud className="size-6 text-app-accent" aria-hidden="true" />
                <span className="text-sm font-medium text-app-ink">
                  Glissez-déposez ou cliquez pour sélectionner
                </span>
                <span className="text-xs">PDF, image ou bureautique · 10 Mo max</span>
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
              className="block text-sm font-medium text-app-ink"
            >
              Commentaire <span className="text-app-ink-muted">(facultatif)</span>
            </label>
            <textarea
              id="version-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex: Contrat corrigé après relecture"
              className="w-full resize-none rounded-md border border-app-surface-3 bg-app-surface-2 px-3 py-2 text-sm text-app-ink placeholder-app-ink-muted focus:outline-none focus:ring-2 focus:ring-app-accent/40"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={upload.isPending || !file}>
              {upload.isPending ? 'Envoi…' : 'Téléverser'}
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
          <DialogTitle>Restaurer la version {version?.version_number}</DialogTitle>
          <DialogDescription>
            Le fichier&nbsp;
            <span className="font-medium text-app-ink">{version?.file_name}</span>
            &nbsp;deviendra la version active. L&apos;historique complet est conservé.
          </DialogDescription>
        </DialogHeader>
        {restore.error ? (
          <p role="alert" className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {restore.error.message ?? 'Erreur lors de la restauration.'}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={restore.isPending}
          >
            {restore.isPending ? 'Restauration…' : 'Confirmer'}
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
  return (
    <li className="flex items-start gap-3 rounded-lg border border-app-surface-3 bg-app-surface-2 px-4 py-3">
      {/* Version badge */}
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-xs font-bold text-app-accent">
        v{version.version_number}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-app-ink">{version.file_name}</span>
          {version.is_active ? (
            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Actif
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-app-ink-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {formatDate(version.created_at)}
          </span>
          <span>{formatBytes(version.size)}</span>
          {version.comment ? (
            <span className="italic">&ldquo;{version.comment}&rdquo;</span>
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
            className="inline-flex size-8 items-center justify-center rounded-md text-app-ink-muted transition-colors hover:bg-app-surface-3 hover:text-app-ink"
            aria-label="Télécharger cette version"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        ) : null}
        {canManage && !version.is_active ? (
          <button
            type="button"
            onClick={() => onRestoreClick(version)}
            className="inline-flex size-8 items-center justify-center rounded-md text-app-ink-muted transition-colors hover:bg-app-surface-3 hover:text-app-ink"
            aria-label={`Restaurer la version ${version.version_number}`}
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
  const [expanded, setExpanded] = useState(defaultOpen);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DocumentVersion | null>(null);

  const { data, isLoading, isError } = useDocumentVersions(
    expanded ? documentId : null,
  );

  const versions: DocumentVersion[] = data?.data ?? [];
  const count = versions.length;

  return (
    <>
      {/* Accordion trigger */}
      <div className="border-t border-app-surface-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-app-ink transition-colors hover:bg-app-surface-2"
          aria-expanded={expanded}
        >
          <History className="size-4 text-app-accent" aria-hidden="true" />
          <span className="flex-1 text-left">
            Historique des versions
            {count > 0 ? (
              <span className="ml-1.5 rounded-full bg-app-accent/10 px-1.5 py-0.5 text-xs font-semibold text-app-accent">
                {count}
              </span>
            ) : null}
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUploadOpen(true);
              }}
              className="flex items-center gap-1 rounded-md bg-app-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
              aria-label="Ajouter une version"
            >
              <UploadCloud className="size-3" aria-hidden="true" />
              Nouvelle version
            </button>
          ) : null}
          {expanded ? (
            <ChevronUp className="size-4 text-app-ink-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 text-app-ink-muted" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expanded content */}
      {expanded ? (
        <div className="px-4 pb-4">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-app-ink-muted">Chargement…</p>
          ) : isError ? (
            <p className="py-4 text-center text-sm text-destructive">
              Impossible de charger les versions.
            </p>
          ) : versions.length === 0 ? (
            <p className="py-4 text-center text-sm text-app-ink-muted">
              Aucune version uploadée.{' '}
              {canManage ? (
                <button
                  type="button"
                  className="underline hover:text-app-accent"
                  onClick={() => setUploadOpen(true)}
                >
                  Ajouter la première version
                </button>
              ) : null}
            </p>
          ) : (
            <ul className="space-y-2 pt-1" aria-label="Liste des versions">
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
