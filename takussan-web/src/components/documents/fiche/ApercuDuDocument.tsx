'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';

import { estUneImage, formatDuFichier } from '@/lib/documents/fiche';
import { cn } from '@/lib/utils';
import type { Document } from '@/types/document';

/**
 * TCK-2656 (lot 3) — l'aperçu de la fiche : l'image elle-même quand le fichier en est une (l'URL
 * signée de l'API sert le fichier `inline`), sinon une tuile qui nomme le format. Une image qui ne se
 * charge pas (URL expirée, format que le navigateur ne lit pas, comme le HEIC) retombe sur la tuile.
 *
 * Maquette : `ApercuCarte` (téléphone : bord à bord, `py-6` ; bureau : 520 px de haut, `bg-muted`).
 */
export function ApercuDuDocument({
  document,
  className,
}: {
  readonly document: Pick<Document, 'name' | 'file_url' | 'file_name' | 'mime_type'>;
  readonly className?: string;
}) {
  const t = useTranslations('documents.fiche');
  const [illisible, setIllisible] = useState(false);
  const image = document.file_url && estUneImage(document.mime_type) && !illisible;
  const format = formatDuFichier(document.file_name, document.mime_type);

  return (
    <div data-testid="apercu-du-document" className={cn('flex items-center justify-center overflow-hidden bg-muted', className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL signée de l'API, qui expire : l'optimiseur la mettrait en cache.
        <img
          src={document.file_url ?? undefined}
          alt={t('apercu', { nom: document.name })}
          onError={() => setIllisible(true)}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="size-12" strokeWidth={1.25} aria-hidden="true" />
          <span className="text-sm font-medium">{format ? t('fichierFormat', { format }) : t('sansFichier')}</span>
        </span>
      )}
    </div>
  );
}
