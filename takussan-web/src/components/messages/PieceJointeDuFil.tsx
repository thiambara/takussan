'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import type { MessagesPage } from '@/lib/queries/conversations';
import type { MessageAttachment } from '@/types/message';

/**
 * TCK-2736 — une pièce jointe du fil s'ouvre sur une URL signée qui vit 5 minutes
 * (`MessageResource::ATTACHMENT_URL_TTL_MINUTES`). Un participant qui garde le fil ouvert plus
 * longtemps tiendrait un lien mort : l'API rendrait 403 à l'ouverture.
 *
 * Deux surfaces, deux mécanismes, parce qu'un 403 ne s'observe pas partout :
 * - **le lien** (`<a target="_blank">`) navigue un onglet d'une autre origine : la page n'en reçoit
 *   aucun événement. On relit donc le fil AVANT d'ouvrir, quand le lien est périmé ;
 * - **la note vocale** (`<audio>`) rend un `error` : on relit le fil APRÈS l'échec, puis on rejoue.
 *
 * « Relire le fil », c'est le `refetch` de la requête infinie que `ChatView` tient déjà : il rend
 * les pages fraîches, où l'on reprend l'URL neuve de la pièce par son identifiant.
 */

/** Le lien est tenu pour périmé une minute avant son expiration réelle (5 min). */
export const AGE_MAX_D_UN_LIEN_MS = 4 * 60_000;
const MARGE_AVANT_EXPIRATION_MS = 60_000;

/** Relit le fil et rend l'URL neuve de la pièce, ou `null` (fil illisible, pièce disparue). */
export type RelirePiece = (attachmentId: number) => Promise<string | null>;

export function urlDeLaPiece(
  data: InfiniteData<MessagesPage> | undefined,
  attachmentId: number,
): string | null {
  for (const page of data?.pages ?? []) {
    for (const message of page.data) {
      for (const piece of message.attachments ?? []) {
        if (piece.id === attachmentId) return piece.url;
      }
    }
  }
  return null;
}

/**
 * Deux critères, l'un ou l'autre suffit :
 * - l'**âge** depuis que ce composant a vu l'URL, mesuré à la seule horloge du navigateur, donc
 *   insensible à un écart d'horloge avec l'API ;
 * - le paramètre `expires` de la signature, qui rattrape une URL tirée du cache avant le montage,
 *   que l'âge sous-estime.
 */
export function lienPerime(url: string, vuA: number | null, maintenant: number): boolean {
  if (vuA !== null && maintenant - vuA > AGE_MAX_D_UN_LIEN_MS) return true;
  let expires: string | null = null;
  try {
    expires = new URL(url, 'http://x.invalid').searchParams.get('expires');
  } catch {
    return false;
  }
  const secondes = expires === null ? Number.NaN : Number(expires);
  return Number.isFinite(secondes) && secondes * 1000 - maintenant < MARGE_AVANT_EXPIRATION_MS;
}

/** L'instant où ce composant a vu `url` pour la première fois (`null` avant le premier effet). */
function usePremiereVue(url: string) {
  const vu = useRef<{ url: string; a: number } | null>(null);
  useEffect(() => {
    if (vu.current?.url !== url) vu.current = { url, a: Date.now() };
  }, [url]);
  return () => (vu.current?.url === url ? vu.current.a : null);
}

interface LienDePieceJointeProps {
  readonly piece: MessageAttachment;
  readonly relirePiece: RelirePiece;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * ⚠ Le clic du milieu et « ouvrir dans un nouvel onglet » ne passent pas par `onClick` : ils
 * ouvrent l'URL telle quelle, périmée ou non. Limite connue.
 */
export function LienDePieceJointe({ piece, relirePiece, className, children }: LienDePieceJointeProps) {
  const vueA = usePremiereVue(piece.url);

  function ouvrir(event: MouseEvent<HTMLAnchorElement>) {
    if (!lienPerime(piece.url, vueA(), Date.now())) return;
    event.preventDefault();
    // L'onglet s'ouvre DANS le geste : après un `await`, le bloqueur de fenêtres le refuserait.
    const onglet = window.open('', '_blank');
    void relirePiece(piece.id).then(
      (url) => {
        if (url === null) {
          onglet?.close();
          return;
        }
        if (onglet) {
          onglet.opener = null;
          onglet.location.href = url;
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
      () => onglet?.close(),
    );
  }

  return (
    <a href={piece.url} target="_blank" rel="noopener noreferrer" className={className} onClick={ouvrir}>
      {children}
    </a>
  );
}

/**
 * La logique du lecteur de note vocale, sans le `<audio>` : l'élément reste dans `ChatView`, où
 * son absence de sous-titres (`jsx-a11y/media-has-caption`) est gelée dans `eslint-suppressions.json`.
 *
 * Sur `error`, le fil est relu et le lecteur rejoue l'URL neuve. Chaque relecture signe une URL
 * neuve : sans borne, un fichier réellement illisible relirait le fil à l'infini. Une seule
 * relecture « gratuite » par montage, puis seulement quand l'URL qui échoue est vue depuis plus de
 * 4 minutes — l'âge seul, à l'horloge du navigateur : avec `expires`, une horloge client en avance
 * tiendrait toute URL fraîche pour périmée, et la borne ne bornerait plus rien.
 */
export function useLecteurDePieceAudio(piece: MessageAttachment, relirePiece: RelirePiece) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const vueA = usePremiereVue(piece.url);
  const dejaRelu = useRef(false);
  const rejouer = useRef(false);
  // L'URL relue vaut jusqu'à ce que le cache, mis à jour par la même relecture, rende la même :
  // React ne réécrit alors pas `src`, ce qui relancerait le chargement en pleine lecture.
  const [relue, setRelue] = useState<{ pour: string; url: string } | null>(null);
  const src = relue !== null && relue.pour === piece.url ? relue.url : piece.url;

  // Sur `relue` et non sur `src` : si le cache a déjà rendu l'URL neuve, `src` ne change plus.
  useEffect(() => {
    if (!rejouer.current) return;
    rejouer.current = false;
    void audio.current?.play()?.catch(() => undefined);
  }, [relue]);

  function onError() {
    const vu = vueA();
    const vieille = vu !== null && Date.now() - vu > AGE_MAX_D_UN_LIEN_MS;
    if (dejaRelu.current && !vieille) return;
    dejaRelu.current = true;
    const pour = piece.url;
    const echoue = src;
    void relirePiece(piece.id).then(
      (url) => {
        if (url === null || url === echoue) return;
        rejouer.current = true;
        setRelue({ pour, url });
      },
      () => undefined,
    );
  }

  return { ref: audio, src, onError };
}
