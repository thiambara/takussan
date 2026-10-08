'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Send, Square, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useSendVoiceNote } from '@/lib/queries/conversations';

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

/**
 * TCK-592 (P19, ADR-0038) — enregistrer, réécouter, envoyer une note vocale. Le prestataire est
 * souvent plus à l'aise à l'oral qu'à l'écrit, et en wolof, que peu de claviers corrigent.
 *
 * Rien n'est rendu sur un navigateur sans `MediaRecorder` : un bouton qui ne peut pas marcher est
 * un défaut. Un refus du micro ou de l'envoi s'affiche, et la note enregistrée reste pour
 * réessayer.
 */
export function VoiceNoteRecorder({ conversationId }: { readonly conversationId: number }) {
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
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setRecorded({ blob, url: URL.createObjectURL(blob), duration });
        setRecording(false);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setRecording(true);
    } catch {
      setError(t('microphoneDenied'));
    }
  };

  const submit = async () => {
    if (!recorded) return;
    setError(null);
    try {
      await send.mutateAsync({ audio: recorded.blob, duration: recorded.duration });
      setRecorded(null);
    } catch (err) {
      setError(messageErreur(err, t('sendFailed')));
    }
  };

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
            onClick={() => setRecorded(null)}
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
          className="size-11 sm:size-9"
          onClick={() => void start()}
          aria-label={t('record')}
        >
          <Mic aria-hidden="true" />
        </Button>
      )}
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
