'use client';

import { useEffect, useState, type AudioHTMLAttributes, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MessageAttachment } from '@/types/message';
import { useLecteurDePieceAudio, type RelirePiece } from './PieceJointeDuFil';

/**
 * TCK-2861 — la note vocale DESSINÉE (maquette `app-messagerie`, e1 et e5) : un rond de lecture, une
 * forme d'onde, la durée « 0:23 ». Ce module est ISOLÉ à dessein : TCK-2901 (ADR-0113) en sortira le
 * lecteur et l'onde en composants réutilisables hors de la messagerie. Rien ici ne lit un `Message`
 * ni `ChatView` : une pièce, une durée, une relecture.
 */

/** Le nombre de barres d'une onde (maquette : 28 dans la bulle). */
export const BARRES_D_UNE_ONDE = 28;

/**
 * L'onde neutre : celle qu'on dessine tant que le fichier n'est pas décodé, ou quand il ne peut pas
 * l'être (navigateur sans `AudioContext`, fichier illisible, URL refusée). Jamais une bulle vide.
 */
export const ONDE_NEUTRE: readonly number[] = Array.from({ length: BARRES_D_UNE_ONDE }, (_, i) => 0.35 + 0.3 * Math.abs(Math.sin(i * 0.9)));

/** `0:23` — une durée en minutes et secondes (maquette « 0:23 », « 0:14 / 1:00 »). */
export function minutesSecondes(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface OndeProps {
  /** Les amplitudes, de 0 à 1, une par barre. */
  readonly niveaux: readonly number[];
  /** La part déjà jouée, de 0 à 1 : les barres jouées sont pleines, les autres atténuées. */
  readonly progression?: number;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/** Une forme d'onde : décorative (la durée et le bouton disent tout), donc cachée aux lecteurs d'écran. */
export function Onde({ niveaux, progression = 0, className, 'data-testid': testId }: OndeProps) {
  const jouees = Math.round(Math.min(1, Math.max(0, progression)) * niveaux.length);
  return (
    <span className={cn('flex h-5 items-center gap-[2px]', className)} aria-hidden="true" data-testid={testId} data-jouees={jouees}>
      {niveaux.map((n, i) => (
        <span
          key={i}
          className={cn('w-[2.5px] flex-none rounded-full bg-current', i < jouees ? 'opacity-100' : 'opacity-40')}
          style={{ height: `${Math.round(3 + Math.min(1, Math.max(0, n)) * 17)}px` }}
        />
      ))}
    </span>
  );
}

type FabriqueDeContexte = new () => AudioContext;

/** L'`AudioContext` du navigateur, ou `null` (rendu serveur, jsdom, très vieux navigateurs). */
export function contexteAudio(): FabriqueDeContexte | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: FabriqueDeContexte; webkitAudioContext?: FabriqueDeContexte };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Les crêtes d'un signal décodé, normalisées à 1 sur la plus forte. */
export function cretes(signal: Float32Array, barres = BARRES_D_UNE_ONDE): number[] {
  if (signal.length === 0) return [...ONDE_NEUTRE];
  const pas = Math.max(1, Math.floor(signal.length / barres));
  const brutes: number[] = [];
  for (let b = 0; b < barres; b++) {
    let max = 0;
    const fin = Math.min(signal.length, (b + 1) * pas);
    for (let i = b * pas; i < fin; i++) {
      const v = Math.abs(signal[i]!);
      if (v > max) max = v;
    }
    brutes.push(max);
  }
  const plafond = Math.max(...brutes);
  return plafond > 0 ? brutes.map((v) => v / plafond) : [...ONDE_NEUTRE];
}

/**
 * Les ondes déjà décodées, par CLÉ STABLE (l'identifiant de la pièce, ou l'URL d'un blob local) :
 * chaque relecture du fil signe une URL neuve, et une clé sur l'URL retéléchargerait toutes les notes.
 */
const ondesDecodees = new Map<string, readonly number[]>();

/**
 * L'onde d'un fichier audio, calculée DANS le navigateur (aucune donnée demandée à l'API) : le
 * fichier est lu, décodé (`decodeAudioData`), réduit à ses crêtes. Sans `AudioContext`, ou sur tout
 * échec, l'onde neutre — et aucune requête n'est faite sans `AudioContext`.
 *
 * ⚠ Un échec ici ne passe JAMAIS par la relecture du fil (`relirePiece`) : c'est le lecteur qui
 * décide qu'une URL est périmée, pas le dessin.
 */
export function useOndeDuFichier(url: string | null, cle: string | null): readonly number[] {
  const [onde, setOnde] = useState<{ cle: string; niveaux: readonly number[] } | null>(null);

  useEffect(() => {
    if (url === null || cle === null || ondesDecodees.has(cle)) return;
    const Fabrique = contexteAudio();
    if (Fabrique === null || typeof fetch !== 'function') return;
    const arret = new AbortController();
    let contexte: AudioContext | null = null;
    void (async () => {
      try {
        const reponse = await fetch(url, { signal: arret.signal });
        if (!reponse.ok) return;
        const donnees = await reponse.arrayBuffer();
        contexte = new Fabrique();
        const decode = await contexte.decodeAudioData(donnees);
        const niveaux = cretes(decode.getChannelData(0));
        ondesDecodees.set(cle, niveaux);
        if (!arret.signal.aborted) setOnde({ cle, niveaux });
      } catch {
        // L'onde neutre reste : un dessin manqué ne dit rien de la note.
      } finally {
        void contexte?.close().catch(() => undefined);
      }
    })();
    return () => arret.abort();
  }, [url, cle]);

  if (cle === null) return ONDE_NEUTRE;
  return ondesDecodees.get(cle) ?? (onde?.cle === cle ? onde.niveaux : ONDE_NEUTRE);
}

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
   * au nom de `ChatView.tsx`, et `check-eslint-suppressions` refuse une entrée neuve. TCK-2901, qui
   * sortira ce lecteur, tranchera (sous-titres ou transcription).
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

/** Réduit une suite d'échantillons de niveau à `barres` barres (la crête de chaque tranche). */
export function reduireLesNiveaux(echantillons: readonly number[], barres = BARRES_D_UNE_ONDE): number[] {
  if (echantillons.length === 0) return [...ONDE_NEUTRE];
  const sortie: number[] = [];
  for (let b = 0; b < barres; b++) {
    const debut = Math.floor((b * echantillons.length) / barres);
    const fin = Math.max(debut + 1, Math.floor(((b + 1) * echantillons.length) / barres));
    sortie.push(Math.max(...echantillons.slice(debut, Math.min(fin, echantillons.length))));
  }
  return sortie;
}

/**
 * L'onde À L'ENREGISTREMENT : le niveau du micro, relevé tous les dixièmes de seconde sur un
 * `AnalyserNode` branché au flux. Rend tous les échantillons de la note en cours (`[]` au départ), ou
 * `null` quand le navigateur n'a pas d'`AudioContext` — l'appelant dessine alors une onde neutre qui
 * avance avec le chronomètre. Les échantillons restent après l'arrêt (l'écoute les réutilise) et
 * repartent de zéro au flux suivant ; le contexte est fermé à l'arrêt, au rejet et au démontage.
 */
export function useNiveauxDuMicro(flux: MediaStream | null): readonly number[] | null {
  const [releve, setReleve] = useState<{ readonly source: MediaStream; readonly valeurs: readonly number[] } | null>(null);
  const disponible = contexteAudio() !== null;

  useEffect(() => {
    if (flux === null) return;
    const Fabrique = contexteAudio();
    if (Fabrique === null) return;
    let contexte: AudioContext | null = null;
    let minuterie: number | undefined;
    try {
      contexte = new Fabrique();
      const analyse = contexte.createAnalyser();
      analyse.fftSize = 512;
      contexte.createMediaStreamSource(flux).connect(analyse);
      const tampon = new Uint8Array(analyse.fftSize);
      minuterie = window.setInterval(() => {
        analyse.getByteTimeDomainData(tampon);
        let somme = 0;
        for (const v of tampon) somme += ((v - 128) / 128) ** 2;
        // RMS remonté (la voix reste sous 0,3) et plafonné à 1.
        const niveau = Math.min(1, Math.sqrt(somme / tampon.length) * 4);
        setReleve((avant) => (avant?.source === flux ? { source: flux, valeurs: [...avant.valeurs, niveau] } : { source: flux, valeurs: [niveau] }));
      }, 100);
    } catch {
      // Pas d'analyse possible : l'onde neutre de l'appelant.
    }
    return () => {
      if (minuterie !== undefined) window.clearInterval(minuterie);
      void contexte?.close().catch(() => undefined);
    };
  }, [flux]);

  if (!disponible) return null;
  // Un flux neuf part d'une onde vide, pas des échantillons de la note d'avant.
  return releve !== null && (flux === null || releve.source === flux) ? releve.valeurs : [];
}
