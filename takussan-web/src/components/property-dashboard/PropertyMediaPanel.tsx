'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaManager, type MediaItem } from '@/components/media';
import {
  deletePropertyMediaAction,
  fetchPropertyMediaAction,
  reorderPropertyMediaAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';

/**
 * TCK-071 — media panel plugged on the property detail / edit page.
 *
 * The panel self-hydrates (fetches the media list once on mount) so it
 * can be dropped into any page that has a property id, without the host
 * page having to care about the dashboard media endpoints.
 */

interface PropertyMediaPanelProps {
  readonly propertyId: number;
}

/**
 * Maps a server-action error message to a more specific user-facing label.
 * The `mapError` helper in dashboard-properties returns "Erreur réseau. Réessayez."
 * for any non-ApiError, which is confusing when it appears on initial page load.
 */
function friendlyMediaError(raw: string): string {
  if (raw === 'Erreur réseau. Réessayez.') {
    return 'Impossible de charger les photos. Vérifiez que le serveur est accessible.';
  }
  return raw;
}

export function PropertyMediaPanel({ propertyId }: PropertyMediaPanelProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Mirror of the full media-id set to diff server responses against.
  // `items` is only set on initial mount; MediaManager owns its own grid
  // state afterwards, so we track previously-seen ids in a ref that is
  // updated on every successful upload. Without this, a second upload
  // would re-emit the first batch as "new" and the grid would duplicate.
  const knownIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetchPropertyMediaAction(propertyId);
      if (cancelled) return;
      if (!res.ok) {
        setError(friendlyMediaError(res.message));
      } else {
        const data = res.data ?? [];
        knownIdsRef.current = new Set(data.map((m) => m.id));
        setItems(
          data.map((m) => ({
            id: m.id,
            thumbnail: m.thumbnail,
            preview: m.preview,
            original: m.original,
            order: m.order,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const handleUpload = useCallback(
    async (files: File[]): Promise<MediaItem[]> => {
      const formData = new FormData();
      for (const f of files) formData.append('photos', f);
      const res = await uploadPropertyPhotosAction(propertyId, formData);
      if (!res.ok) throw new Error(res.message);
      // Refresh to pick up server-assigned ids / thumbnails.
      const list = await fetchPropertyMediaAction(propertyId);
      if (!list.ok) return [];
      const data = list.data ?? [];
      const fresh = data.filter((m) => !knownIdsRef.current.has(m.id));
      // Update the ref BEFORE returning so concurrent/rapid uploads don't
      // re-emit the same items twice.
      for (const m of fresh) knownIdsRef.current.add(m.id);
      return fresh.map((m) => ({
        id: m.id,
        thumbnail: m.thumbnail,
        preview: m.preview,
        original: m.original,
        order: m.order,
      }));
    },
    [propertyId],
  );

  const handleReorder = useCallback(
    async (mediaIds: number[]) => {
      const res = await reorderPropertyMediaAction(propertyId, mediaIds);
      if (!res.ok) throw new Error(res.message);
    },
    [propertyId],
  );

  const handleDelete = useCallback(
    async (mediaId: number) => {
      const res = await deletePropertyMediaAction(propertyId, mediaId);
      if (!res.ok) throw new Error(res.message);
      knownIdsRef.current.delete(mediaId);
    },
    [propertyId],
  );

  if (loading) {
    return (
      <section className="rounded-xl bg-app-surface-1 p-6">
        <h2 className="text-base font-semibold text-app-ink">Photos</h2>
        <p className="mt-2 text-xs text-app-ink-muted">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-app-surface-1 p-6">
      {error ? (
        <p className="mb-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <MediaManager
        items={items}
        onUpload={handleUpload}
        onReorder={handleReorder}
        onDelete={handleDelete}
        title="Photos du bien"
        hint="Glissez pour réorganiser — la première photo devient la couverture."
      />
    </section>
  );
}
