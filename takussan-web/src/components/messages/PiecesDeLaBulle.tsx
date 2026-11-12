'use client';

import { useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Paperclip } from 'lucide-react';
import { tailleLisible } from '@/lib/messages/piece-jointe';
import { cn } from '@/lib/utils';
import type { MessageAttachment } from '@/types/message';
import { LienDePieceJointe, type RelirePiece } from './PieceJointeDuFil';

interface PiecesDeLaBulleProps {
  readonly pieces: readonly MessageAttachment[];
  readonly isOwn: boolean;
  readonly relirePiece: RelirePiece;
}

/**
 * TCK-2632 — les pièces d'une bulle (TCK-2631) : la photo en VIGNETTE (`thumbnail_url`, 400 px,
 * retombant sur `url` tant que la file `media` ne l'a pas produite), le PDF en carte (nom, poids),
 * tout autre fichier en lien. Chacune s'ouvre par l'URL signée, relue si elle a expiré
 * (`LienDePieceJointe`, TCK-2736).
 */
export function PiecesDeLaBulle({ pieces, isOwn, relirePiece }: PiecesDeLaBulleProps) {
  if (pieces.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {pieces.map((p) => (
        <li key={p.id}>
          {p.mime_type?.startsWith('image/') ? (
            <VignetteDePhoto piece={p} relirePiece={relirePiece} />
          ) : p.mime_type === 'application/pdf' ? (
            <CarteDeDocument piece={p} isOwn={isOwn} relirePiece={relirePiece} />
          ) : (
            <LienDePieceJointe
              piece={p}
              relirePiece={relirePiece}
              className={cn('inline-flex items-center gap-1 text-xs underline', isOwn ? 'text-primary-foreground/90' : 'text-foreground')}
            >
              <Paperclip className="size-3" aria-hidden />
              {p.name}
            </LienDePieceJointe>
          )}
        </li>
      ))}
    </ul>
  );
}

function VignetteDePhoto({ piece, relirePiece }: { readonly piece: MessageAttachment; readonly relirePiece: RelirePiece }) {
  const t = useTranslations('messaging.bulle');
  // La vignette est signée comme l'original : périmée, elle échoue au chargement. Le fil est relu
  // UNE fois par montage, et la vignette neuve arrive par le cache.
  const dejaRelu = useRef(false);
  return (
    <LienDePieceJointe piece={piece} relirePiece={relirePiece} className="-mx-1.5 -mt-0.5 block overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de l'API, qui expire : l'optimiseur la mettrait en cache. */}
      <img
        src={piece.thumbnail_url ?? piece.url}
        alt={t('ouvrirLaPhoto')}
        loading="lazy"
        className="block max-h-72 w-auto max-w-full rounded-xl object-cover outline -outline-offset-1 outline-foreground/10"
        onError={() => {
          if (dejaRelu.current) return;
          dejaRelu.current = true;
          void relirePiece(piece.id);
        }}
      />
    </LienDePieceJointe>
  );
}

function CarteDeDocument({ piece, isOwn, relirePiece }: { readonly piece: MessageAttachment; readonly isOwn: boolean; readonly relirePiece: RelirePiece }) {
  const t = useTranslations('messaging.bulle');
  const locale = useLocale();
  const poids = tailleLisible(piece.size, locale);
  return (
    <LienDePieceJointe
      piece={piece}
      relirePiece={relirePiece}
      className={cn(
        'flex min-w-48 max-w-full items-center gap-2.5 rounded-xl p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring',
        isOwn ? 'bg-primary-foreground/10' : 'bg-muted',
      )}
    >
      <span className={cn('inline-flex size-10 flex-none items-center justify-center rounded-lg', isOwn ? 'bg-primary-foreground/15' : 'bg-card')}>
        <FileText className="size-5 stroke-[1.75]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{piece.name}</span>
        <span className={cn('block text-xs tabular-nums', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {poids ? t('pdfPoids', { poids }) : t('pdf')}
        </span>
      </span>
    </LienDePieceJointe>
  );
}
