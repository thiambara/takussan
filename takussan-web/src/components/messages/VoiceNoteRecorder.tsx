'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Pause, Play, Send, SendHorizontal, Square, Trash2 } from 'lucide-react';

import { BARRES_D_UNE_ONDE, ONDE_NEUTRE, Onde, minutesSecondes, reduireLesNiveaux, useNiveauxDuMicro, useOndeDuFichier } from '@/components/note-vocale/onde';
import { VOICE_NOTE_MAX_SECONDS, useEnregistreurDeNoteVocale } from '@/components/note-vocale/useEnregistreurDeNoteVocale';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useSendVoiceNote } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';

/**
 * TCK-2901 — la borne vit avec l'enregistreur partagé (`useEnregistreurDeNoteVocale`) ; elle est
 * ré-exportée ici pour les lecteurs de la messagerie. La garde de parité
 * (`seuils-de-saisie.parity.test.ts`) lit sa définition là-bas.
 */
export { VOICE_NOTE_MAX_SECONDS };

type Recorded = { blob: Blob; url: string; duration: number };

/**
 * TCK-592 (P19, ADR-0038) — enregistrer, réécouter, envoyer une note vocale. Le prestataire est
 * souvent plus à l'aise à l'oral qu'à l'écrit, et en wolof, que peu de claviers corrigent.
 *
 * Rien n'est rendu sur un navigateur sans `MediaRecorder` : un bouton qui ne peut pas marcher est
 * un défaut. Un refus du micro ou de l'envoi s'affiche, et la note enregistrée reste pour
 * réessayer.
 */
interface VoiceNoteRecorderProps {
  readonly conversationId: number;
  /**
   * TCK-2632 — le composeur de la messagerie (maquette : « micro qui devient envoyer ») : au repos,
   * le micro s'efface quand le champ porte un texte ou une pièce, et l'envoi prend sa place. Le
   * composant reste MONTÉ : une note en cours ne se perd pas.
   */
  readonly auRepos?: 'visible' | 'masque';
  /** Le micro rond de la maquette, au lieu du bouton fantôme carré. */
  readonly rond?: boolean;
  /** Vrai de l'enregistrement jusqu'à l'envoi ou au rejet de la note : le composeur s'efface devant elle. */
  readonly onActif?: (actif: boolean) => void;
}

export function VoiceNoteRecorder({ conversationId, auRepos = 'visible', rond = false, onActif }: VoiceNoteRecorderProps) {
  const t = useTranslations('messaging.voiceNote');
  const messageErreur = useMessageErreurApi();
  const send = useSendVoiceNote(conversationId);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // TCK-2901 — l'enregistrement (micro, formats, borne de 60 s) est le socle partagé ; ce composant
  // n'y ajoute que ce qui est propre à la messagerie : l'écoute dans le composeur et l'envoi.
  const enregistreur = useEnregistreurDeNoteVocale({
    onDebut: () => onActif?.(true),
    onSansNote: () => onActif?.(false),
    onNote: (note) => setRecorded({ blob: note.blob, url: URL.createObjectURL(note.blob), duration: note.duration }),
  });
  const { supporte: supported, enregistre: recording, ecoule: elapsed, flux } = enregistreur;
  const error = sendError ?? (enregistreur.erreur === 'micro' ? t('microphoneDenied') : null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lecture, setLecture] = useState(false);
  // TCK-2861 — l'onde : le niveau du micro pendant l'enregistrement, puis la position de l'écoute.
  const [ecoute, setEcoute] = useState(0);
  const echantillons = useNiveauxDuMicro(recording ? flux : null);
  // Sans échantillons (navigateur sans `AudioContext`), l'écoute décode le blob ; à défaut, l'onde neutre.
  const ondeDuBlob = useOndeDuFichier(
    recorded && (echantillons === null || echantillons.length === 0) ? recorded.url : null,
    recorded ? `blob:${recorded.url}` : null,
  );

  useEffect(() => () => {
    if (recorded) URL.revokeObjectURL(recorded.url);
  }, [recorded]);

  if (!supported) return null;

  const start = async () => {
    setSendError(null);
    await enregistreur.demarrer();
  };

  const submit = async () => {
    if (!recorded) return;
    setSendError(null);
    try {
      await send.mutateAsync({ audio: recorded.blob, duration: recorded.duration });
      audioRef.current?.pause();
      audioRef.current = null;
      setLecture(false);
      setEcoute(0);
      setRecorded(null);
      onActif?.(false);
    } catch (err) {
      setSendError(messageErreur(err, t('sendFailed')));
    }
  };

  if (!recorded && !recording && auRepos === 'masque') {
    return error ? <p role="alert" className="w-full text-xs text-destructive">{error}</p> : null;
  }

  const jeter = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setLecture(false);
    setEcoute(0);
    setRecorded(null);
    onActif?.(false);
  };

  /*
   * TCK-2632 — dans le composeur de la messagerie (maquette `app-messagerie`, « Composeur » en
   * enregistrement et en écoute) : « jeter » à gauche, une pilule qui dit le temps sur la borne
   * (« 0:14 / 1:00 »), puis « arrêter » ou « envoyer » en rond.
   *
   * TCK-2861 — l'onde de la maquette est dessinée, et MESURÉE : en enregistrement, les derniers
   * niveaux du micro (`useNiveauxDuMicro`) ; en écoute, toute la note réduite à ses crêtes, qui se
   * remplit avec la lecture. Sans `AudioContext`, une onde neutre qui avance avec le chronomètre.
   */
  if (rond && (recording || recorded)) {
    const mesure = echantillons !== null && echantillons.length > 0;
    const onde = recording
      ? mesure
        ? { niveaux: [...Array<number>(Math.max(0, BARRES_D_UNE_ONDE - echantillons.length)).fill(0.05), ...echantillons.slice(-BARRES_D_UNE_ONDE)], progression: 1 }
        : { niveaux: ONDE_NEUTRE, progression: elapsed / VOICE_NOTE_MAX_SECONDS }
      : { niveaux: mesure ? reduireLesNiveaux(echantillons) : ondeDuBlob, progression: recorded ? ecoute / recorded.duration : 0 };
    const bouton = 'inline-flex size-11 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60';
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="note-vocale-en-cours">
        {recording ? (
          <p className="w-full text-center text-xs text-muted-foreground">
            {t('borne', { max: VOICE_NOTE_MAX_SECONDS })}
          </p>
        ) : null}
        <button
          type="button"
          className={cn(bouton, 'text-destructive hover:bg-destructive/10')}
          disabled={send.isPending}
          onClick={() => {
            if (recording) {
              enregistreur.jeter();
            } else {
              jeter();
            }
          }}
          aria-label={t('discard')}
        >
          <Trash2 className="size-5 stroke-[1.75]" aria-hidden="true" />
        </button>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-background px-3.5">
          {recording ? (
            <span className="size-2.5 flex-none animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!recorded) return;
                // Un lecteur sans élément : la pilule porte son propre bouton (maquette).
                if (!audioRef.current) {
                  audioRef.current = new Audio(recorded.url);
                  audioRef.current.onended = () => {
                    setLecture(false);
                    setEcoute(0);
                  };
                  audioRef.current.ontimeupdate = () => setEcoute(audioRef.current?.currentTime ?? 0);
                }
                const a = audioRef.current;
                if (a.paused) void a.play().then(() => setLecture(true)).catch(() => setLecture(false));
                else {
                  a.pause();
                  setLecture(false);
                }
              }}
              aria-label={t('preview')}
              aria-pressed={lecture}
              className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-secondary text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {lecture ? <Pause className="size-3.5 fill-current" aria-hidden="true" /> : <Play className="size-3.5 fill-current" aria-hidden="true" />}
            </button>
          )}
          <Onde
            niveaux={onde.niveaux}
            progression={onde.progression}
            className="min-w-0 flex-1 overflow-hidden text-muted-foreground"
            data-testid={recording ? 'onde-enregistrement' : 'onde-ecoute'}
          />
          <span className="flex-none text-ui tabular-nums text-encre-douce">
            {minutesSecondes(recording ? elapsed : (recorded?.duration ?? 0))}
            <span className="text-muted-foreground"> / {minutesSecondes(VOICE_NOTE_MAX_SECONDS)}</span>
          </span>
        </div>
        {recording ? (
          <button
            type="button"
            className={cn(bouton, 'bg-foreground text-background hover:bg-foreground/90')}
            onClick={() => enregistreur.arreter()}
            aria-label={t('stop')}
          >
            <Square className="size-4 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(bouton, 'bg-primary text-primary-foreground hover:bg-primary/90')}
            disabled={send.isPending}
            onClick={() => void submit()}
            aria-label={t('send')}
          >
            <SendHorizontal className="size-5" aria-hidden="true" />
          </button>
        )}
        {error ? <p role="alert" className="w-full text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recorded ? (
        <>
          <audio src={recorded.url} controls preload="metadata" className="h-9 max-w-56" aria-label={t('preview')} />
          <Button
            type="button"
            size="icon"
            className="size-11 sm:size-9"
            disabled={send.isPending}
            onClick={() => void submit()}
            aria-label={t('send')}
          >
            <Send aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            disabled={send.isPending}
            onClick={() => {
              setRecorded(null);
              onActif?.(false);
            }}
            aria-label={t('discard')}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </>
      ) : recording ? (
        <Button
          type="button"
          variant="destructive"
          className="h-11 sm:h-9"
          onClick={() => enregistreur.arreter()}
          aria-label={t('stop')}
        >
          <Square aria-hidden="true" />
          <span className="tabular-nums">{t('elapsed', { seconds: elapsed, max: VOICE_NOTE_MAX_SECONDS })}</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={
            rond
              ? 'size-11 rounded-full bg-secondary text-primary-deep hover:bg-secondary/80 lg:border lg:border-border lg:bg-card lg:text-encre-douce lg:hover:bg-muted'
              : 'size-11 sm:size-9'
          }
          onClick={() => void start()}
          aria-label={t('record')}
        >
          <Mic className={rond ? 'size-5 stroke-[1.75]' : undefined} aria-hidden="true" />
        </Button>
      )}
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
