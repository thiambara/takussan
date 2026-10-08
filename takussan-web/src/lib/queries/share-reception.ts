import { ApiError, apiFetch, urlApiPublique } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-587 §8 — la réception d'un lien de partage, côté destinataire (sans compte).
 *
 * ⚠ Le mot de passe d'un lien protégé voyage dans le CORPS d'un `POST`, jamais dans l'URL :
 * l'API refuse en 400 toute URL qui porte `password` (`DocumentShareLinkController`), parce qu'une
 * URL s'écrit dans l'historique, les journaux d'accès du proxy et l'en-tête `Referer`. Sans mot de
 * passe, un `GET` suffit — et c'est sa réponse 401 qui dit qu'il en faut un.
 */
export interface SharedDocument {
  readonly token: string;
  readonly document: {
    readonly id: number;
    readonly name: string;
    readonly type: string | null;
    readonly size: number | null;
  };
  readonly expires_at: string | null;
  readonly downloads_count: number;
  readonly max_downloads: number | null;
}

function chemin(token: string, telechargement = false): string {
  return telechargement ? cheminApi`/share/${token}/download` : cheminApi`/share/${token}`;
}

function corps(password: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  };
}

export async function fetchSharedDocument(
  token: string,
  password?: string,
): Promise<SharedDocument> {
  const res = await apiFetch<{ data: SharedDocument }>(
    chemin(token),
    password === undefined ? undefined : corps(password),
  );
  return res.data;
}

/** Le fichier du lien, en flux ; chaque appel compte un téléchargement côté API. */
export async function downloadSharedDocument(token: string, password?: string): Promise<Blob> {
  const res = await fetch(
    urlApiPublique(chemin(token, true)),
    password === undefined ? { method: 'GET' } : corps(password),
  );
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }
  return res.blob();
}
