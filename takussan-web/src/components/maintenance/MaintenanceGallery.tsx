'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useUploadMaintenancePhotos } from '@/lib/queries/maintenance';
import { reduirePhotos } from '@/lib/reduire-photo';
import type { MaintenanceMediaItem, MaintenanceRequest } from '@/types/maintenance';

/**
 * TCK-592 (P7, P15) — les pièces de la demande, en URL signées : le signalement, Avant, Après, et
 * les pièces du devis (absentes de la réponse pour qui n'a pas à les lire).
 *
 * Le prestataire accepté y prend ses photos « avant » à l'appareil (`capture`). Un échec se voit,
 * et les fichiers choisis restent pour réessayer.
 */
export function MaintenanceGallery({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.intervention.gallery');
  const media = request.media;
  const canUploadBefore = request.abilities?.can_upload_before_photos === true;

  if (!media) return null;

  const groups: { key: string; title: string; items: readonly MaintenanceMediaItem[] }[] = [
    { key: 'photos', title: t('reported'), items: media.photos },
    { key: 'before', title: t('before'), items: media.before_photos },
    { key: 'after', title: t('after'), items: media.completion_photos },
  ];
  if (media.quotes) {
    groups.push({ key: 'quotes', title: t('quotes'), items: media.quotes });
  }

  const hasAny = groups.some((g) => g.items.length > 0);
  if (!hasAny && !canUploadBefore) return null;

  return (
    <section className="rounded-xl bg-card p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>

      <div className="mt-4 space-y-5">
        {groups.map((group) =>
          group.items.length > 0 ? (
            <div key={group.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <MediaThumb item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>

      {canUploadBefore ? <BeforePhotosUpload id={request.id} /> : null}
    </section>
  );
}

function MediaThumb({ item }: { readonly item: MaintenanceMediaItem }) {
  const isImage = item.mime_type?.startsWith('image/') === true;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block aspect-square overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL d'API signée et éphémère : rien à optimiser.
        <img src={item.url} alt={item.name} className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
          <FileText className="size-5" aria-hidden="true" />
          <span className="line-clamp-2 break-all">{item.name}</span>
        </span>
      )}
    </a>
  );
}

function BeforePhotosUpload({ id }: { readonly id: number }) {
  const t = useTranslations('maintenance.intervention.gallery');
  const messageErreur = useMessageErreurApi();
  const upload = useUploadMaintenancePhotos();
  const [files, setFiles] = useState<File[]>([]);

  const send = async () => {
    await upload.mutateAsync({ id, files: await reduirePhotos(files), collection: 'before_photos' });
    setFiles([]);
  };

  return (
    <div className="mt-5 border-t border-border pt-4">
      <label htmlFor="before-photos" className="mb-1.5 block text-sm font-medium">
        {t('before_label')}
      </label>
      <input
        id="before-photos"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted sm:file:h-8"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="h-11 sm:h-9"
          disabled={files.length === 0 || upload.isPending}
          onClick={() => void send().catch(() => undefined)}
        >
          {upload.isPending ? t('sending') : t('send', { count: files.length })}
        </Button>
        {upload.isError ? (
          <span role="alert" className="text-xs text-destructive">
            {messageErreur(upload.error, t('failed'))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
