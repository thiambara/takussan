'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * TCK-2901 (ADR-0113 § 1) — ENREGISTRER une note vocale, sans rien envoyer : sorti de
 * `VoiceNoteRecorder` (TCK-592, TCK-2632), qui mêlait l'enregistrement et l'envoi propre à la
 * messagerie. Le hook rend à son appelant un fichier, son type MIME et une durée ; l'écran qui
 * l'emploie décide de ce qu'il en fait (la messagerie l'envoie en message, une demande
 * d'intervention le joint à son signalement — TCK-2902).
 */

/** ADR-0038 : 60 secondes au plus. L'enregistrement s'arrête de lui-même à la borne. */
export const VOICE_NOTE_MAX_SECONDS = 60;

/** Les formats que `SendMessageConversationRequest::AUDIO_MIMETYPES` accepte, par préférence (ADR-0038). */
export const FORMATS_PREFERES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;

/** Ce que l'enregistreur rend : le fichier, son type, sa durée en secondes (1 à 60). */
export interface NoteVocale {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly duration: number;
}

/**
 * `toucher` : un geste démarre, un autre arrête (la messagerie). `appui` : « gardez le micro
 * appuyé » — relâcher arrête, et un appui bref (moins d'une demi-seconde, durée arrondie à 0 s) ne
 * produit aucune note : c'est un toucher manqué, pas un message.
 */
export type ModeDEnregistrement = 'toucher' | 'appui';

export function enregistrementPossible(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function formatPrefere(): string | undefined {
  return FORMATS_PREFERES.find((type) => window.MediaRecorder.isTypeSupported?.(type));
}

/** La capacité du navigateur ne change pas en cours de page : rien à écouter. */
const rienAEcouter = () => () => {};

interface Options {
  readonly mode?: ModeDEnregistrement;
  /** La note enregistrée. Jamais appelé pour une note jetée, ni pour un appui bref en mode `appui`. */
  readonly onNote: (note: NoteVocale) => void;
  /** L'enregistrement a commencé (le micro est ouvert). */
  readonly onDebut?: () => void;
  /** L'enregistrement s'est arrêté sans produire de note (jeté, ou appui trop bref). */
  readonly onSansNote?: () => void;
}

export interface EnregistreurDeNoteVocale {
  /** Faux au rendu serveur et sur un navigateur sans `MediaRecorder` : l'appelant ne rend RIEN. */
  readonly supporte: boolean;
  readonly enregistre: boolean;
  /** Secondes écoulées de l'enregistrement en cours. */
  readonly ecoule: number;
  /** Le flux du micro pendant l'enregistrement (l'onde le mesure), sinon `null`. */
  readonly flux: MediaStream | null;
  /** `micro` : l'accès au micro a été refusé (ou n'a pas pu s'ouvrir). */
  readonly erreur: 'micro' | null;
  readonly demarrer: () => Promise<void>;
  readonly arreter: () => void;
  /** Arrête sans garder la note. */
  readonly jeter: () => void;
}

export function useEnregistreurDeNoteVocale({ mode = 'toucher', onNote, onDebut, onSansNote }: Options): EnregistreurDeNoteVocale {
  // Lu après l'hydratation : le rendu serveur ne connaît ni `window` ni le micro.
  const supporte = useSyncExternalStore(rienAEcouter, enregistrementPossible, () => false);
  const [enregistre, setEnregistre] = useState(false);
  const [ecoule, setEcoule] = useState(0);
  const [flux, setFlux] = useState<MediaStream | null>(null);
  const [erreur, setErreur] = useState<'micro' | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const debutRef = useRef(0);
  // « Jeter » pendant l'enregistrement : la note arrêtée n'est pas gardée.
  const jeterRef = useRef(false);
  // En mode `appui`, le doigt peut se relever AVANT que le micro soit ouvert (`getUserMedia` est
  // asynchrone) : l'arrêt est retenu et appliqué dès le démarrage.
  const demarrageRef = useRef(false);
  const arretDemandeRef = useRef(false);
  // Vrai du `start()` au `onstop` : lu plutôt que `recorder.state`, pour n'arrêter qu'une fois.
  const actifRef = useRef(false);
  const rappels = useRef({ onNote, onDebut, onSansNote, mode });
  useEffect(() => {
    rappels.current = { onNote, onDebut, onSansNote, mode };
  });

  useEffect(() => {
    if (!enregistre) return;
    const minuterie = window.setInterval(() => {
      const secondes = Math.floor((Date.now() - debutRef.current) / 1000);
      setEcoule(secondes);
      // Une seule fois : la minuterie peut tourner encore avant que React l'ait retirée.
      if (secondes >= VOICE_NOTE_MAX_SECONDS && actifRef.current) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(minuterie);
  }, [enregistre]);

  // Un écran quitté en cours d'enregistrement ferme le micro, sans rendre de note.
  useEffect(() => () => {
    if (actifRef.current) {
      jeterRef.current = true;
      recorderRef.current?.stop();
    }
  }, []);

  const demarrer = useCallback(async () => {
    if (demarrageRef.current || actifRef.current) return;
    demarrageRef.current = true;
    arretDemandeRef.current = false;
    setErreur(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = formatPrefere();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const morceaux: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) morceaux.push(e.data);
      };
      recorder.onstop = () => {
        actifRef.current = false;
        stream.getTracks().forEach((piste) => piste.stop());
        const brute = Math.round((Date.now() - debutRef.current) / 1000);
        setEnregistre(false);
        setFlux(null);
        const { onNote: rendre, onSansNote: sansNote, mode: modeCourant } = rappels.current;
        if (jeterRef.current || (modeCourant === 'appui' && brute <= 0)) {
          jeterRef.current = false;
          sansNote?.();
          return;
        }
        const duration = Math.min(VOICE_NOTE_MAX_SECONDS, Math.max(1, brute));
        const type = recorder.mimeType || 'audio/webm';
        rendre({ blob: new Blob(morceaux, { type }), mimeType: type, duration });
      };
      recorderRef.current = recorder;
      debutRef.current = Date.now();
      setEcoule(0);
      recorder.start();
      actifRef.current = true;
      setFlux(stream);
      setEnregistre(true);
      rappels.current.onDebut?.();
      if (arretDemandeRef.current) recorder.stop();
    } catch {
      setErreur('micro');
    } finally {
      demarrageRef.current = false;
    }
  }, []);

  const arreter = useCallback(() => {
    if (demarrageRef.current) {
      arretDemandeRef.current = true;
      return;
    }
    if (actifRef.current) recorderRef.current?.stop();
  }, []);

  const jeter = useCallback(() => {
    jeterRef.current = true;
    arreter();
  }, [arreter]);

  return { supporte, enregistre, ecoule, flux, erreur, demarrer, arreter, jeter };
}
