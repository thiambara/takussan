'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { GripVertical, Loader2, Star, Trash2, UploadCloud, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * MediaManager — TCK-071
 *
 * Reusable gallery manager with:
 *  - multi-file drag-drop upload zone (images by default) with
 *    per-file progress lines and independent error reporting
 *  - sortable thumbnail grid (native HTML5 drag-drop, no extra dep)
 *    with immediate persist via the caller-provided `onReorder`
 *  - client-side MIME + size validation (prevents pointless requests)
 *
 * Plug the callbacks to any resource's media endpoints. The backend
 * contract we assume:
 *   - `onUpload(files)` resolves once the items are persisted and returns
 *     the freshly-created media (so the grid updates immediately).
 *   - `onReorder(orderedIds)` persists the new order. First id = cover.
 *   - `onDelete(id)` removes a single item.
 *
 * The component is **optimistic** on reorder / delete — it mutates the
 * grid first, then calls the server. If the server rejects it, we revert
 * using the snapshot captured before the mutation.
 */

export interface MediaItem {
  readonly id: number;
  readonly thumbnail: string;
  readonly preview?: string;
  readonly original?: string;
  readonly order?: number | null;
}

export interface MediaManagerProps {
  readonly items: MediaItem[];
  readonly onUpload: (
    files: File[],
    onProgress: (perFile: UploadProgress[]) => void,
  ) => Promise<MediaItem[]>;
  readonly onReorder: (mediaIds: number[]) => Promise<void>;
  readonly onDelete: (mediaId: number) => Promise<void>;
  /** Accepted MIME list — defaults to images only. */
  readonly accept?: readonly string[];
  /** Max size per file in bytes — defaults to 10 Mo for property images. */
  readonly maxSize?: number;
  /** Max number of files in a single drop — defaults to 20. */
  readonly maxFiles?: number;
  /** Optional header title rendered above the dropzone. */
  readonly title?: string;
  /** Localized dropzone hint. */
  readonly hint?: string;
}

export interface UploadProgress {
  readonly name: string;
  readonly size: number;
  readonly status: 'pending' | 'uploading' | 'done' | 'error';
  readonly progress: number; // 0..100
  readonly error?: string;
}

const DEFAULT_ACCEPT: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 20;

function formatMo(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

/**
 * Signature minimale d'un traducteur next-intl. `validateFile` vit au niveau du module — aucun
 * hook n'y est appelable — donc le traducteur lui est PASSÉ par le composant appelant
 * (TCK-292, lot I). Les deux appelants, `MediaManager` et `MediaDropzone`, en ont un.
 */
type Traducteur = (cle: string, valeurs?: Record<string, string | number>) => string;

function validateFile(
  file: File,
  accept: readonly string[],
  maxSize: number,
  t: Traducteur,
): string | null {
  if (!accept.includes(file.type)) {
    return t('unsupported_type', { type: file.type || t('unknown_mime') });
  }
  if (file.size > maxSize) {
    return t('too_large', { size: formatMo(maxSize) });
  }
  return null;
}

export function MediaManager({
  items,
  onUpload,
  onReorder,
  onDelete,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
  maxFiles = DEFAULT_MAX_FILES,
  title,
  hint,
}: MediaManagerProps) {
  const t = useTranslations('media');
  const [grid, setGrid] = useState<MediaItem[]>(items);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Mirror of `dragIndex` so synchronous drop handlers can read it even
  // before React has committed the state update from dragStart.
  const dragIndexRef = useRef<number | null>(null);

  // Sync external updates (e.g. initial fetch).
  useEffect(() => {
    setGrid(items);
  }, [items]);

  const acceptAttr = useMemo(() => accept.join(','), [accept]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      if (fileList.length > maxFiles) {
        setError(t('max_files_batch', { max: maxFiles }));
        return;
      }

      const files = Array.from(fileList);
      const entries: UploadProgress[] = files.map((f) => {
        const err = validateFile(f, accept, maxSize, t);
        return {
          name: f.name,
          size: f.size,
          status: err ? 'error' : 'pending',
          progress: err ? 0 : 0,
          error: err ?? undefined,
        };
      });

      setProgress(entries);
      setError(null);

      const valid = files.filter((_, i) => entries[i].status !== 'error');
      if (valid.length === 0) return;

      // Mark valid files as uploading and simulate progress. The server
      // action is atomic per-call (no XHR-level progress events), so we
      // animate optimistically — the final state swaps to `done` once the
      // call resolves, or `error` on failure.
      setProgress((prev) =>
        prev.map((p) =>
          p.status === 'error' ? p : { ...p, status: 'uploading', progress: 10 },
        ),
      );

      const tick = window.setInterval(() => {
        setProgress((prev) =>
          prev.map((p) =>
            p.status === 'uploading' && p.progress < 85
              ? { ...p, progress: p.progress + 10 }
              : p,
          ),
        );
      }, 150);

      try {
        const created = await onUpload(valid, (next) => setProgress(next));
        setGrid((prev) => [...prev, ...created]);
        setProgress((prev) =>
          prev.map((p) =>
            p.status === 'uploading' ? { ...p, status: 'done', progress: 100 } : p,
          ),
        );
      } catch (e) {
        setProgress((prev) =>
          prev.map((p) =>
            p.status === 'uploading'
              ? {
                  ...p,
                  status: 'error',
                  progress: 0,
                  error:
                    e instanceof Error ? e.message : t('upload_error'),
                }
              : p,
          ),
        );
      } finally {
        window.clearInterval(tick);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [accept, maxFiles, maxSize, onUpload, t],
  );

  const persistReorder = useCallback(
    async (next: MediaItem[]) => {
      const snapshot = grid;
      setGrid(next);
      try {
        await onReorder(next.map((m) => m.id));
      } catch {
        setGrid(snapshot);
        setError(t('reorder_error'));
      }
    },
    [grid, onReorder, t],
  );

  const onItemDrop = useCallback(
    (targetIndex: number) => {
      const from = dragIndexRef.current;
      if (from === null || from === targetIndex) {
        setDragIndex(null);
        setDropTarget(null);
        dragIndexRef.current = null;
        return;
      }
      const next = [...grid];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      setDragIndex(null);
      setDropTarget(null);
      dragIndexRef.current = null;
      void persistReorder(next);
    },
    [grid, persistReorder],
  );

  const deleteItem = useCallback(
    async (mediaId: number) => {
      setBusyId(mediaId);
      const snapshot = grid;
      setGrid((prev) => prev.filter((m) => m.id !== mediaId));
      try {
        await onDelete(mediaId);
      } catch {
        setGrid(snapshot);
        setError(t('delete_error'));
      } finally {
        setBusyId(null);
      }
    },
    [grid, onDelete, t],
  );

  const makeCover = useCallback(
    (mediaId: number) => {
      const next = [
        ...grid.filter((m) => m.id === mediaId),
        ...grid.filter((m) => m.id !== mediaId),
      ];
      void persistReorder(next);
    },
    [grid, persistReorder],
  );

  return (
    <div className="space-y-4" data-testid="media-manager">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title ?? t('title')}</h3>
          {hint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {grid.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t.rich('photo_count', {
              count: grid.length,
              sup: (chunks) => <sup>{chunks}</sup>,
            })}
          </span>
        ) : null}
      </header>

      <label
        htmlFor="media-manager-input"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOverDropzone(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOverDropzone(true);
        }}
        onDragLeave={() => setIsDragOverDropzone(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOverDropzone(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60',
          isDragOverDropzone && 'border-primary bg-muted',
        )}
      >
        <UploadCloud className="size-6 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t('dropzone_title')}</p>
        <p className="text-xs">
          {t('dropzone_hint', { size: formatMo(maxSize), max: maxFiles })}
        </p>
        <input
          ref={fileInputRef}
          id="media-manager-input"
          data-testid="media-manager-input"
          type="file"
          accept={acceptAttr}
          multiple
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {progress.length > 0 ? (
        <ul className="space-y-2" data-testid="media-manager-progress">
          {progress.map((p) => (
            <li
              key={`${p.name}-${p.size}`}
              className={cn(
                'flex items-center gap-3 rounded-md bg-muted px-3 py-2 text-xs',
                p.status === 'error' && 'bg-destructive/10 text-destructive',
              )}
            >
              <span className="w-40 flex-none truncate text-foreground">{p.name}</span>
              <span className="w-20 flex-none text-muted-foreground">
                {formatMo(p.size)}
              </span>
              {p.status === 'error' ? (
                <span className="flex-1" role="alert">
                  {p.error}
                </span>
              ) : (
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      'h-full bg-primary transition-[width]',
                      p.status === 'done' && 'bg-green-500',
                    )}
                    style={{ width: `${p.progress}%` }}
                    data-testid="progress-bar"
                    data-status={p.status}
                    data-progress={p.progress}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {grid.length > 0 ? (
        <ul
          className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
          data-testid="media-manager-grid"
        >
          {grid.map((item, index) => (
            <MediaTile
              key={item.id}
              item={item}
              index={index}
              isCover={index === 0}
              isDragging={dragIndex === index}
              isDropTarget={dropTarget === index}
              isBusy={busyId === item.id}
              onDragStart={() => {
                dragIndexRef.current = index;
                setDragIndex(index);
              }}
              onDragOver={(e: ReactDragEvent<HTMLLIElement>) => {
                e.preventDefault();
                setDropTarget(index);
              }}
              onDrop={() => onItemDrop(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setDropTarget(null);
              }}
              onDelete={() => void deleteItem(item.id)}
              onMakeCover={() => makeCover(item.id)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface MediaTileProps {
  readonly item: MediaItem;
  readonly index: number;
  readonly isCover: boolean;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly isBusy: boolean;
  readonly onDragStart: () => void;
  readonly onDragOver: (e: ReactDragEvent<HTMLLIElement>) => void;
  readonly onDrop: () => void;
  readonly onDragEnd: () => void;
  readonly onDelete: () => void;
  readonly onMakeCover: () => void;
}

function MediaTile({
  item,
  index,
  isCover,
  isDragging,
  isDropTarget,
  isBusy,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDelete,
  onMakeCover,
}: MediaTileProps) {
  const t = useTranslations('media');

  return (
    <li
      draggable
      data-testid="media-tile"
      data-index={index}
      data-cover={isCover ? 'true' : 'false'}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border bg-muted',
        isDragging && 'opacity-40',
        isDropTarget && 'ring-2 ring-primary',
        isBusy && 'pointer-events-none opacity-60',
      )}
    >
      {/* biome-ignore lint/a11y/useAltText: thumbnails have decorative role; grid announces count */}
      <img
        src={item.thumbnail}
        alt=""
        loading="lazy"
        className="aspect-square w-full object-cover"
        draggable={false}
      />
      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold text-foreground">
        <GripVertical className="size-3" aria-hidden="true" />
        {index + 1}
      </span>
      {isCover ? (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-background">
          <Star className="size-3" aria-hidden="true" />
          {t('cover')}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!isCover ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onMakeCover}
            className="h-7 px-2 text-xs"
          >
            <Star className="size-3" aria-hidden="true" />
            <span className="ml-1">{t('cover')}</span>
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
          aria-label={t('delete_photo_aria')}
          className="h-7 px-2 text-xs"
        >
          {isBusy ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-3" aria-hidden="true" />
          )}
        </Button>
      </div>
    </li>
  );
}

/**
 * Minimal self-contained export for consumers that simply want to
 * remove files from a local pending list (see PropertyForm) without
 * persisting to a server. Keeps PropertyForm change-surface small.
 */
export function MediaDropzone({
  onChange,
  files,
  onRemove,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
  maxFiles = DEFAULT_MAX_FILES,
}: {
  readonly onChange: (files: File[]) => void;
  readonly files: File[];
  readonly onRemove: (index: number) => void;
  readonly accept?: readonly string[];
  readonly maxSize?: number;
  readonly maxFiles?: number;
}) {
  const t = useTranslations('media');
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndEmit = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      if (list.length + files.length > maxFiles) {
        setError(t('max_files', { max: maxFiles }));
        return;
      }
      const next: File[] = [];
      for (const f of Array.from(list)) {
        const err = validateFile(f, accept, maxSize, t);
        if (err) {
          setError(err);
          return;
        }
        next.push(f);
      }
      setError(null);
      onChange(next);
    },
    [accept, files.length, maxFiles, maxSize, onChange, t],
  );

  return (
    <div>
      <label
        htmlFor="media-dropzone-input"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          validateAndEmit(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/60',
          isDragOver && 'border-primary bg-muted',
        )}
      >
        <UploadCloud className="size-6 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t('dropzone_title')}</p>
        <p className="text-xs">
          {t('dropzone_hint_short', { size: formatMo(maxSize), max: maxFiles })}
        </p>
        <input
          id="media-dropzone-input"
          data-testid="media-dropzone-input"
          type="file"
          accept={accept.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => validateAndEmit(e.target.files)}
        />
      </label>

      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="group relative overflow-hidden rounded-lg bg-muted p-2 text-xs"
            >
              <span className="block truncate text-foreground">{file.name}</span>
              <span className="block text-muted-foreground">{formatMo(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-1 top-1 rounded-full bg-background/70 p-1 text-foreground transition-opacity hover:bg-background"
                aria-label={t('remove_file_aria', { name: file.name })}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
