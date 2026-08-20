'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaManager, type MediaItem } from '@/components/media';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('property.dashboard.media');
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
        setError(res.message);
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
        <h2 className="text-base font-semibold text-app-ink">{t('photos')}</h2>
        <p className="mt-2 text-xs text-app-ink-muted">{t('loading')}</p>
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
        maxSize={10 * 1024 * 1024}
        title={t('title')}
        hint={t('hint')}
      />
    </section>
  );
}
