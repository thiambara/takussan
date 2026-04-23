'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function PropertyMediaPanel({ propertyId }: PropertyMediaPanelProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetchPropertyMediaAction(propertyId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
      } else {
        setItems(
          (res.data ?? []).map((m) => ({
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
      const prevIds = new Set(items.map((m) => m.id));
      if (!list.ok) return [];
      const next = (list.data ?? [])
        .filter((m) => !prevIds.has(m.id))
        .map((m) => ({
          id: m.id,
          thumbnail: m.thumbnail,
          preview: m.preview,
          original: m.original,
          order: m.order,
        }));
      return next;
    },
    [items, propertyId],
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
