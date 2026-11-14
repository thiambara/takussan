'use client';

import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { MesPiecesResponse, ProfilDesPieces } from '@/lib/pieces/pieces';

/**
 * TCK-2614 — `GET /api/me/pieces` : les pièces du PROFIL ACTIF, leur état, le fichier envoyé et le NINEA masqué.
 *
 * Sans le profil : changer d'espace oublie tout le cache de l'espace (`oublierLeCacheDEspace`), cette clé comprise.
 * ⚠ Le préfixe `/api` est écrit ici : `useApiQuery` ne l'ajoute pas (CLAUDE.md racine).
 */
export const CLE_PIECES = ['me', 'pieces'] as const;

export function useMesPieces() {
  const { token } = useAuth();
  return useApiQuery<MesPiecesResponse>([...CLE_PIECES], '/api/me/pieces', { enabled: Boolean(token), retry: false });
}

/** L'erreur d'un envoi par le relais : son statut et son corps, pour `messageCorpsErreurBff`. */
export class EchecDEnvoi extends Error {
  constructor(
    readonly status: number,
    readonly corps: unknown,
  ) {
    super(`envoi refusé (${status})`);
  }
}

/**
 * Une pièce envoyée par le relais multipart same-origin (`src/app/api/me/<segment>/[id]/kyc/upload`), et non par une
 * server action : celles-ci ne relaient pas proprement un corps `multipart/form-data`.
 */
export async function envoyerLaPiece(profil: ProfilDesPieces, code: string, fichier: File): Promise<void> {
  const corps = new FormData();
  corps.append('file', fichier);
  corps.append('kind', code);
  const reponse = await fetch(cheminApi`/api/me/${profil.segment}/${profil.id}/kyc/upload`, {
    method: 'POST',
    body: corps,
    credentials: 'same-origin',
  });
  if (!reponse.ok) throw new EchecDEnvoi(reponse.status, await reponse.json().catch(() => null));
}

/** Le NINEA tapé (`PATCH /api/me/owner-profiles/{id}/tax-id`) : la réponse ne porte que sa forme masquée. */
export async function enregistrerLeNinea(token: string, ownerProfileId: number, numero: string): Promise<void> {
  await apiRequest(cheminApi`/api/me/owner-profiles/${ownerProfileId}/tax-id`, {
    method: 'PATCH',
    token,
    body: { tax_id: numero },
  });
}
