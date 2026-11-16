'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Pause } from 'lucide-react';

import { cn } from '@/lib/utils';
import { minutesSecondes } from './onde';

interface EtatDeLecture {
  readonly src: string;
  readonly enLecture: boolean;
  readonly ecoule: number;
  readonly dureeLue: number | null;
  readonly echec: boolean;
}

function etatInitial(src: string): EtatDeLecture {
  return { src, enLecture: false, ecoule: 0, dureeLue: null, echec: false };
}

interface PastilleDeNoteVocaleProps {
  /** L'URL du fichier : un `blob:` local (la note qu'on vient d'enregistrer) ou une URL signée (ADR-0113 § 4). */
  readonly src: string;
  /** La durée déclarée, en secondes (`duration` d'ADR-0038) — elle fait foi : un webm rend souvent `Infinity`. */
  readonly duree?: number | null;
  /** La lecture a échoué (URL périmée, format illisible) : l'appelant peut relire l'URL. */
  readonly onErreur?: () => void;
  readonly className?: string;
}

/**
 * TCK-2901 (ADR-0113) — LE lecteur de note vocale hors de la messagerie : la pastille de la maquette
 * `app-interventions` (« Message vocal · 0:18 », un disque primaire), téléphone et bureau.
 *
 * Toute la pastille est UN bouton (cible de 44 px) : « Écouter » puis « Mettre en pause », nommé
 * pour un lecteur d'écran et jouable au clavier. Le disque porte le micro de la maquette au repos
 * (le nom accessible dit « Écouter »), et « pause » pendant la lecture.
 *
 * La lecture passe par `new Audio()`, sans élément `<audio>` dans le DOM : rien à sous-titrer
 * (`jsx-a11y/media-has-caption`) — la transcription reste hors périmètre (ADR-0038, ADR-0113).
 */
export function PastilleDeNoteVocale({ src, duree, onErreur, className }: PastilleDeNoteVocaleProps) {
  const t = useTranslations('common.noteVocale');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // L'état est rangé sous l'URL qu'il décrit : une URL neuve (relue, ou une autre note) repart de zéro.
  const [etat, setEtat] = useState<EtatDeLecture>(() => etatInitial(src));
  const courant = etat.src === src ? etat : etatInitial(src);
  const rappelErreur = useRef(onErreur);
  useEffect(() => {
    rappelErreur.current = onErreur;
  });

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'none';
    const poser = (delta: Partial<EtatDeLecture>) =>
      setEtat((avant) => ({ ...(avant.src === src ? avant : etatInitial(src)), ...delta }));
    audio.onplay = () => poser({ enLecture: true, echec: false });
    audio.onpause = () => poser({ enLecture: false });
    audio.onended = () => poser({ enLecture: false, ecoule: 0 });
    audio.ontimeupdate = () => poser({ ecoule: audio.currentTime });
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) poser({ dureeLue: audio.duration });
    };
    audio.onerror = () => {
      poser({ enLecture: false, echec: true });
      rappelErreur.current?.();
    };
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.onplay = audio.onpause = audio.onended = audio.ontimeupdate = audio.onloadedmetadata = audio.onerror = null;
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [src]);

  const { enLecture, ecoule, dureeLue, echec } = courant;
  const total = duree && duree > 0 ? duree : dureeLue;
  // En lecture (ou en pause au milieu), le temps écoulé ; au repos, la durée de la note.
  const affiche = enLecture || ecoule > 0 ? ecoule : total;

  function basculer() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play()?.catch(() => undefined);
    else audio.pause();
  }

  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <button
        type="button"
        onClick={basculer}
        aria-label={enLecture ? t('pause') : t('ecouter')}
        className="inline-flex h-11 max-w-full items-center gap-2 rounded-full border border-border bg-card pl-3 pr-4 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        data-testid="pastille-note-vocale"
      >
        <span className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
          {enLecture ? <Pause className="size-3.5 fill-current" /> : <Mic className="size-4" />}
        </span>
        <span className="truncate">
          {t('libelle')}
          {affiche !== null ? <span className="tabular-nums"> · {minutesSecondes(affiche)}</span> : null}
        </span>
      </button>
      {echec ? <span role="alert" className="text-xs text-destructive">{t('lectureImpossible')}</span> : null}
    </span>
  );
}
