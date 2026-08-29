'use client';

import { useTranslations } from 'next-intl';

import { MediaDropzone } from '@/components/media';

const MAX_PHOTOS = 10;

/**
 * TCK-464 — l'étape des photos, la seule qui se saute (`skippable`).
 *
 * Elle ne possède aucun champ du formulaire : les fichiers vivent dans l'état de l'assemblage,
 * qui seul sait les envoyer APRÈS la création du bien (l'envoi a besoin de l'id). L'erreur lui
 * est donc rendue en prop plutôt que devinée ici.
 */
export function StepPhotos({
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

  return (
    <>
      <MediaDropzone onChange={onChange} files={files} onRemove={onRemove} maxFiles={MAX_PHOTOS} />
      <p className="text-xs text-muted-foreground">
        {t('photosCounter', { count: files.length, max: MAX_PHOTOS })}
      </p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}
