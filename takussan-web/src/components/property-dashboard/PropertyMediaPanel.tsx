'use client';

import { useCallback, useEffect, useState } from 'react';

import { MediaManager, type MediaItem } from '@/components/media';
import { Skeleton } from '@/components/ui/skeleton';
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
 *
 * TCK-2370 (P237.03) — une photo envoyée est rendue depuis la réponse de l'envoi, qui porte les
 * médias créés. Elle était cherchée par une relecture de la liste, dont l'échec rendait `[]` : la
 * ligne passait à « envoyée » sans photo dans la grille.
 */

interface PropertyMediaPanelProps {
  readonly propertyId: number;
}

export function PropertyMediaPanel({ propertyId }: PropertyMediaPanelProps) {
  const t = useTranslations('property.dashboard.media');
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
        const data = res.data ?? [];
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
      return (res.data ?? []).map((m) => ({
        id: m.id,
        thumbnail: m.thumbnail,
        preview: m.preview,
        original: m.original,
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
    },
    [propertyId],
  );

  if (loading) {
    return (
      // Un squelette à la forme du gestionnaire (titre, consigne, zone de dépôt), plus une
      // ligne « Chargement… » : l'onglet ne saute plus de 60 px quand la liste arrive.
      <section className="rounded-xl bg-card p-6" aria-busy="true">
        <h2 className="text-base font-semibold text-foreground">{t('photos')}</h2>
        <span className="sr-only">{t('loading')}</span>
        <Skeleton className="mt-2 h-3 w-2/3 max-w-sm" />
        <Skeleton className="mt-4 h-40 w-full rounded-xl" />
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-card p-6">
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
