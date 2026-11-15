'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, CloudUpload, Images, Plus, X } from 'lucide-react';

import { useDepotDeFichiers } from '@/components/media';
import { cn } from '@/lib/utils';

import { VignetteFichier } from './ApercuAnnonce';

const MAX_PHOTOS = 10;
const POIDS_MAX = 10 * 1024 * 1024;

/**
 * TCK-2819 (lot 2) — le dépôt de photos de l'assistant, d'après la maquette `app-entree-publier`
 * (écran a-4) : au téléphone, deux tuiles (« Prendre une photo », « Choisir dans la galerie ») ; au
 * bureau, une zone où glisser les fichiers. Puis le compte, et les vignettes en grille — la première
 * porte « Couverture », une tuile « Ajouter » ferme la grille.
 *
 * Les règles du dépôt (plafond, réduction des photos, type, poids) sont celles de `MediaDropzone`, par
 * le même `useDepotDeFichiers` : seul le dessin est propre à l'assistant. Les autres écrans qui
 * déposent des fichiers gardent `MediaDropzone`.
 *
 * ⚠ Les champs de fichier vivent HORS des tuiles et de la zone, qui n'en sont que les `<label>` : une
 * tuile masquée au bureau (`lg:hidden`) ne doit pas emporter avec elle le champ que la zone du bureau
 * désigne. `media-dropzone-input` reste le champ de la galerie.
 *
 * ⚠ « Prendre une photo » ne paraît au bureau que sur un écran tactile (`pointer-fine:hidden`, TCK-913) :
 * sur un ordinateur, `capture` est ignoré et le geste doublerait la zone. La maquette le dessine au
 * bureau ; l'écart est consigné dans la fiche de fidélité.
 */
export function DepotDePhotos({
  files,
  onChange,
  onRemove,
  error,
}: {
  readonly files: File[];
  readonly onChange: (files: File[]) => void;
  readonly onRemove: (index: number) => void;
  readonly error: string | null;
}) {
  const t = useTranslations('property.wizard');
  const tMedia = useTranslations('media');
  const depot = useDepotDeFichiers({ files, onChange, maxSize: POIDS_MAX, maxFiles: MAX_PHOTOS });
  const [survol, setSurvol] = useState(false);
  const galerieId = useId();
  const cameraId = useId();
  const poids = t('photos.size');
  const plein = files.length >= MAX_PHOTOS;

  return (
    <div className="group/depot">
      <input
        id={galerieId}
        data-testid="media-dropzone-input"
        type="file"
        accept={depot.accept.join(',')}
        multiple
        data-champ="galerie"
        className="sr-only"
        onChange={(e) => {
          void depot.deposer(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        id={cameraId}
        type="file"
        accept={depot.accept.join(',')}
        capture="environment"
        data-champ="camera"
        className="sr-only"
        onChange={(e) => {
          void depot.deposer(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Téléphone : deux tuiles de 76 px. */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        <label
          htmlFor={cameraId}
          className="flex min-h-19 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-primary bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 group-has-[[data-champ=camera]:focus-visible]/depot:ring-3 group-has-[[data-champ=camera]:focus-visible]/depot:ring-ring"
        >
          <Camera className="size-5" strokeWidth={1.75} aria-hidden="true" />
          {tMedia('take_photo')}
        </label>
        <label
          htmlFor={galerieId}
          className="flex min-h-19 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted group-has-[[data-champ=galerie]:focus-visible]/depot:ring-3 group-has-[[data-champ=galerie]:focus-visible]/depot:ring-ring"
        >
          <Images className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          {t('photos.gallery')}
        </label>
      </div>

      {/* Bureau : la zone où glisser les fichiers. */}
      <label
        htmlFor={galerieId}
        onDragEnter={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          void depot.deposer(e.dataTransfer.files);
        }}
        className={cn(
          'hidden cursor-pointer flex-col items-center rounded-xl border border-dashed border-input bg-card px-6 py-7 text-center transition-colors hover:border-primary lg:flex group-has-[[data-champ=galerie]:focus-visible]/depot:ring-3 group-has-[[data-champ=galerie]:focus-visible]/depot:ring-ring',
          survol && 'border-primary bg-muted',
        )}
      >
        <CloudUpload className="size-8 text-muted-foreground" strokeWidth={1.25} aria-hidden="true" />
        <span className="mt-3 text-corps font-medium text-foreground">{tMedia('dropzone_title')}</span>
        <span className="mt-1 text-ui text-muted-foreground">{t('photos.dropHint', { size: poids, max: MAX_PHOTOS })}</span>
      </label>
      <label
        htmlFor={cameraId}
        className="mt-3 hidden min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted lg:inline-flex pointer-fine:hidden group-has-[[data-champ=camera]:focus-visible]/depot:ring-3 group-has-[[data-champ=camera]:focus-visible]/depot:ring-ring"
      >
        <Camera className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {tMedia('take_photo')}
      </label>

      <p className="mt-2.5 text-ui leading-snug text-muted-foreground">{t('photos.formats', { size: poids })}</p>

      {depot.error || error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {depot.error ?? error}
        </p>
      ) : null}

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <p className="text-corps font-semibold text-foreground tabular-nums">
          {t('photosCounter', { count: files.length, max: MAX_PHOTOS })}
        </p>
        {files.length > 0 ? <p className="text-ui text-muted-foreground">{t('photos.firstIsCover')}</p> : null}
      </div>

      {files.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-5">
          {files.map((fichier, index) => (
            <li key={`${fichier.name}-${index}`} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              <VignetteFichier fichier={fichier} />
              {/* 44 px de cible, un rond de 28 px dessiné dans son coin (maquette). */}
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={tMedia('remove_file_aria', { name: fichier.name })}
                className="group/retirer absolute top-0 right-0 inline-flex size-11 items-start justify-end p-1.5 focus-visible:outline-none"
              >
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-foreground/65 text-background transition-colors group-hover/retirer:bg-foreground group-focus-visible/retirer:ring-3 group-focus-visible/retirer:ring-ring">
                  <X className="size-4" aria-hidden="true" />
                </span>
              </button>
              {index === 0 ? (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-card px-2 py-0.5 text-legende font-semibold text-foreground">
                  {t('photos.cover')}
                </span>
              ) : null}
            </li>
          ))}
          {plein ? null : (
            <li>
              <label
                htmlFor={galerieId}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                <Plus className="size-5" strokeWidth={1.5} aria-hidden="true" />
                {t('photos.add')}
              </label>
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
