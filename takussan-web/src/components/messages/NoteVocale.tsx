'use client';

import { useState, type AudioHTMLAttributes, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';

import { Onde, minutesSecondes, useOndeDuFichier } from '@/components/note-vocale/onde';
import { cn } from '@/lib/utils';
import type { MessageAttachment } from '@/types/message';
import { useLecteurDePieceAudio, type RelirePiece } from './PieceJointeDuFil';

/**
 * TCK-2861 — la note vocale DESSINÉE (maquette `app-messagerie`, e1 et e5) : un rond de lecture, une
 * forme d'onde, la durée « 0:23 ». Rien ici ne lit un `Message` ni `ChatView` : une pièce, une
 * durée, une relecture.
 *
 * TCK-2901 (ADR-0113) — l'onde et la durée sont sorties dans `components/note-vocale/onde.tsx`, et le
 * lecteur réutilisable hors de la messagerie est `PastilleDeNoteVocale`. Cette bulle-ci RESTE propre à
 * la messagerie : elle lit une PIÈCE d'un message, dont l'URL signée se relit quand elle périme
 * (`useLecteurDePieceAudio`, TCK-2736) — ce que la pastille, qui reçoit une URL, n'a pas à savoir.
 */

/** Les attributs que le lecteur pose sur son élément `<audio>` (sans `controls` : il est caché). */
export type AttributsDeLAudio = AudioHTMLAttributes<HTMLAudioElement> & { readonly ref: Ref<HTMLAudioElement> };

interface LecteurDeNoteVocaleProps {
  readonly piece: MessageAttachment;
  /** La durée déclarée par l'émetteur (`metadata.duration`, ADR-0038), en secondes. */
  readonly duree?: number | null;
  readonly relirePiece: RelirePiece;
  /** La bulle est la mienne (fond sombre) : le rond de lecture s'y éclaircit. */
  readonly mienne?: boolean;
  /**
   * Rend l'élément `<audio>` avec les attributs donnés. L'élément est écrit par l'APPELANT : son
   * absence de sous-titres (`jsx-a11y/media-has-caption`) est gelée dans `eslint-suppressions.json`
   * au nom de `ChatView.tsx`, et `check-eslint-suppressions` refuse une entrée neuve. TCK-2901 a
   * tranché : la bulle reste ici et garde ce gel (la transcription, qui lèverait l'absence de
   * sous-titres, est hors périmètre d'ADR-0038 comme d'ADR-0113) ; la pastille partagée joue par
   * `new Audio()` et n'écrit aucun élément.
   */
  readonly rendreAudio: (attributs: AttributsDeLAudio) => ReactNode;
}

/**
 * La bulle d'une note vocale : « Lire » / « Pause » nommés, l'onde qui se remplit à la lecture, la
 * durée (puis le temps écoulé pendant la lecture). L'élément `<audio>` reste dans le DOM (rendu par
 * `rendreAudio`), SANS `controls` : le lecteur natif n'est plus montré, mais la relecture d'une URL périmée
 * (`useLecteurDePieceAudio`, TCK-2736) écoute toujours son `error`.
 *
 * L'état « en lecture » se lit sur les ÉVÉNEMENTS de l'élément (`play`, `pause`, `ended`), jamais
 * sur le clic : après une URL périmée, le hook relance la lecture de lui-même.
 */
export function LecteurDeNoteVocale({ piece, duree, relirePiece, mienne = false, rendreAudio }: LecteurDeNoteVocaleProps) {
  const t = useTranslations('messaging.voiceNote');
  const { ref, src, onError } = useLecteurDePieceAudio(piece, relirePiece);
  const [enLecture, setEnLecture] = useState(false);
  const [ecoule, setEcoule] = useState(0);
  // MediaRecorder rend souvent `duration = Infinity` pour un webm : la durée déclarée fait foi.
  const [dureeLue, setDureeLue] = useState<number | null>(null);
  const total = duree && duree > 0 ? duree : dureeLue;
  const niveaux = useOndeDuFichier(src, `piece:${piece.id}`);

  function basculer() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play()?.catch(() => undefined);
    else a.pause();
  }

  const progression = total ? ecoule / total : 0;

  return (
    <div role="group" aria-label={t('label')} className="flex items-center gap-2.5 py-0.5">
      {rendreAudio({
        ref,
        src,
        onError,
        preload: 'none',
        className: 'hidden',
        onPlay: () => setEnLecture(true),
        onPause: () => setEnLecture(false),
        onEnded: () => {
          setEnLecture(false);
          setEcoule(0);
        },
        onTimeUpdate: (e) => setEcoule(e.currentTarget.currentTime),
        onLoadedMetadata: (e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDureeLue(d);
        },
      })}
      <button
        type="button"
        onClick={basculer}
        aria-label={enLecture ? t('pause') : t('lire')}
        className={cn(
          'inline-flex size-8 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring',
          mienne ? 'bg-background/15 text-background' : 'bg-secondary text-primary-deep',
        )}
      >
        {enLecture ? <Pause className="size-4 fill-current" aria-hidden="true" /> : <Play className="size-4 fill-current" aria-hidden="true" />}
      </button>
      <Onde niveaux={niveaux} progression={progression} className="min-w-0" data-testid="onde-de-la-note" />
      {total ? (
        <span className="flex-none text-xs tabular-nums opacity-70">{minutesSecondes(enLecture || ecoule > 0 ? ecoule : total)}</span>
      ) : null}
    </div>
  );
}

