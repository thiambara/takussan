'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Pause, Play, Send, SendHorizontal, Square, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useSendVoiceNote } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';

/** ADR-0038 : 60 secondes au plus. L'enregistrement s'arrête de lui-même à la borne. */
export const VOICE_NOTE_MAX_SECONDS = 60;

/** Les formats que `SendMessageConversationRequest::AUDIO_MIMETYPES` accepte, par préférence. */
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function supportsRecording(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function pickMimeType(): string | undefined {
  return PREFERRED_TYPES.find((type) => window.MediaRecorder.isTypeSupported?.(type));
}

/** La capacité du navigateur ne change pas en cours de page : rien à écouter. */
const subscribeNothing = () => () => {};

type Recorded = { blob: Blob; url: string; duration: number };

/** `0:14` — la durée d'une note, en minutes et secondes (maquette « 0:14 / 1:00 »). */
function minutesSecondes(secondes: number): string {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

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
  // Lu après l'hydratation : le rendu serveur ne connaît ni `window` ni le micro.
  const supported = useSyncExternalStore(subscribeNothing, supportsRecording, () => false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  // « Jeter » pendant l'enregistrement : la note arrêtée n'est pas gardée.
  const jeterRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lecture, setLecture] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= VOICE_NOTE_MAX_SECONDS) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    if (recorded) URL.revokeObjectURL(recorded.url);
  }, [recorded]);

  if (!supported) return null;

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const duration = Math.min(
          VOICE_NOTE_MAX_SECONDS,
          Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        );
        setRecording(false);
        if (jeterRef.current) {
          jeterRef.current = false;
          onActif?.(false);
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setRecorded({ blob, url: URL.createObjectURL(blob), duration });
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setRecording(true);
      onActif?.(true);
    } catch {
      setError(t('microphoneDenied'));
    }
  };

  const submit = async () => {
    if (!recorded) return;
    setError(null);
    try {
      await send.mutateAsync({ audio: recorded.blob, duration: recorded.duration });
      audioRef.current?.pause();
      audioRef.current = null;
      setLecture(false);
      setRecorded(null);
      onActif?.(false);
    } catch (err) {
      setError(messageErreur(err, t('sendFailed')));
    }
  };

  if (!recorded && !recording && auRepos === 'masque') {
    return error ? <p role="alert" className="w-full text-xs text-destructive">{error}</p> : null;
  }

  const jeter = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setLecture(false);
    setRecorded(null);
    onActif?.(false);
  };

  /*
   * TCK-2632 — dans le composeur de la messagerie (maquette `app-messagerie`, « Composeur » en
   * enregistrement et en écoute) : « jeter » à gauche, une pilule qui dit le temps sur la borne
   * (« 0:14 / 1:00 »), puis « arrêter » ou « envoyer » en rond. L'onde de la maquette n'est pas
   * dessinée : sans mesure du signal, elle ne dirait rien de vrai.
   */
  if (rond && (recording || recorded)) {
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
              jeterRef.current = true;
              recorderRef.current?.stop();
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
                  audioRef.current.onended = () => setLecture(false);
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
          <span className="min-w-0 flex-1" />
          <span className="flex-none text-ui tabular-nums text-encre-douce">
            {minutesSecondes(recording ? elapsed : (recorded?.duration ?? 0))}
            <span className="text-muted-foreground"> / {minutesSecondes(VOICE_NOTE_MAX_SECONDS)}</span>
          </span>
        </div>
        {recording ? (
          <button
            type="button"
            className={cn(bouton, 'bg-foreground text-background hover:bg-foreground/90')}
            onClick={() => recorderRef.current?.stop()}
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
          onClick={() => recorderRef.current?.stop()}
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
