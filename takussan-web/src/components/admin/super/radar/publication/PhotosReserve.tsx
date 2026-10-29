'use client';

import { useRef } from 'react';
import { ImagePlus, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  RADAR_PHOTOS_PAR_ENVOI_MAX,
  RADAR_RESERVE_PHOTOS_MAX,
  type RadarPublicationListing,
} from '@/types/radar';

interface PhotosReserveProps {
  readonly annonce: RadarPublicationListing;
  /** Un geste est en vol, ou la publication part : on regarde, on ne touche pas. */
  readonly desactive: boolean;
  readonly onRetirer: (mediaId: number) => void;
  readonly onDeposer: (fichiers: readonly File[]) => void;
  readonly onRecuperer: () => void;
}

/**
 * TCK-2389 (décision 3a) — la réserve de photos d'une annonce : ce que `publish` copiera sur le bien, dans cet
 * ordre. Chaque vignette se retire ; l'opérateur dépose des photos à la main, ou relance la lecture de la source
 * (une annonce-URL : `photo_preparation.total` > 0). Tant que la préparation tourne, l'écran le dit et se relit.
 * Les vignettes sont des URL signées de l'original privé (`PrivateMediaAccess`, 5 min).
 */
export function PhotosReserve({ annonce, desactive, onRetirer, onDeposer, onRecuperer }: PhotosReserveProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.photos');
  const champ = useRef<HTMLInputElement>(null);
  const { photos, photo_preparation: preparation } = annonce;
  const pleine = photos.length >= RADAR_RESERVE_PHOTOS_MAX;
  const enPreparation = preparation.status === 'pending';

  return (
    <div className="space-y-2" data-testid={`radar-publication-photos-${annonce.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-foreground">
          {t('heading', { taken: photos.length, max: RADAR_RESERVE_PHOTOS_MAX })}
        </h4>
        {preparation.status !== 'none' ? (
          <p role="status" className="text-xs text-muted-foreground" data-testid={`radar-publication-preparation-${annonce.id}`}>
            {enPreparation
              ? t('preparing', { done: preparation.done, total: preparation.total })
              : t('prepared', { done: preparation.done, total: preparation.total })}
          </p>
        ) : null}
      </div>

      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={t('list', { id: annonce.id })}>
          {photos.map((photo, rang) => (
            <li key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de l'original privé (5 min) : rien à optimiser ni à mettre en cache. */}
              <img
                src={photo.url}
                alt={t('alt', { rank: rang + 1, id: annonce.id })}
                loading="lazy"
                className="size-20 rounded-md border object-cover"
              />
              <button
                type="button"
                disabled={desactive}
                aria-label={t('remove', { rank: rang + 1, id: annonce.id })}
                onClick={() => onRetirer(photo.id)}
                className="absolute -top-1.5 -right-1.5 inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={champ}
          type="file"
          multiple
          hidden
          accept="image/jpeg,image/png,image/webp"
          aria-label={t('input', { id: annonce.id })}
          data-testid={`radar-publication-depot-${annonce.id}`}
          onChange={(event) => {
            const fichiers = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (fichiers.length > 0) onDeposer(fichiers);
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={desactive || pleine} onClick={() => champ.current?.click()}>
          <ImagePlus className="size-3.5" aria-hidden="true" />
          {t('upload')}
        </Button>
        {preparation.total > 0 ? (
          <Button type="button" size="sm" variant="outline" disabled={desactive || enPreparation} onClick={onRecuperer}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t('fetch')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {pleine ? t('full', { max: RADAR_RESERVE_PHOTOS_MAX }) : t('hint', { max: RADAR_PHOTOS_PAR_ENVOI_MAX })}
      </p>
    </div>
  );
}
