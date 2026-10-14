'use client';

import { useMyProfiles } from '@/hooks/useProfiles';
import type { AgencyKind, MyProfilesResponse } from '@/types/profile';

/**
 * TCK-645 — la nature de l'espace dans lequel la personne travaille, lue sur le PROFIL ACTIF.
 *
 * Quatre réponses, et non trois :
 *
 *   · `standard` / `individual` — le `kind` de l'agence du profil actif, tel que
 *     `GET /api/me/profiles` le rend (le sparse fieldset de `lib/profiles.ts` le demande, TCK-497) ;
 *   · `sans-agence` — un compte sans aucun profil (client), ou un profil actif rattaché à aucune
 *     agence ;
 *   · `inconnue` — tout le reste : réponse pas encore arrivée ou en erreur, `kind` absent ou `null`,
 *     profil actif introuvable dans la liste, ou des profils sans qu'aucun soit actif.
 *
 * *Écraser « je ne sais pas » en « non » ne change pas forcément la décision ; cela change ce qu'on
 * raconte à l'utilisateur* — même raison que `agencyIsStandard` du layout `/app`, qui garde
 * `undefined` distinct de `false`. Ici, l'appelant décide quoi faire de l'inconnu.
 */
export type NatureDeLEspace = AgencyKind | 'sans-agence' | 'inconnue';

export function natureDeLEspaceActif(reponse: MyProfilesResponse | undefined): NatureDeLEspace {
  if (!reponse) return 'inconnue';
  const actifId = reponse.meta.active_profile_id;
  if (actifId === null) return reponse.data.length === 0 ? 'sans-agence' : 'inconnue';
  const actif = reponse.data.find((p) => p.id === actifId);
  if (!actif) return 'inconnue';
  if (actif.agency_id === null) return 'sans-agence';
  const kind = actif.agency?.kind;
  return kind === 'standard' || kind === 'individual' ? kind : 'inconnue';
}

/**
 * « Nouveau groupe » est-il proposé ? Non dans une agence `individual` — décision du porteur du
 * 2026-10-14, côté front SEULEMENT : l'API garde la règle de périmètre de TCK-565, et les groupes
 * existants restent lisibles.
 *
 * ⚠ **Fail-closed sur `inconnue`.** Le bouton n'est qu'une proposition — l'API ne refuse rien de
 * plus —, donc le risque n'est pas un accès, c'est ce que voit le pouce : un bouton montré pendant
 * le chargement puis retiré disparaît sous le doigt de la personne en agence individuelle, alors
 * qu'un bouton qui arrive une fraction de seconde après la liste ne coûte rien à l'agence standard
 * (la requête est d'ordinaire déjà en cache : le sélecteur de profil de la barre haute la monte).
 * En erreur durable, l'agence standard perd le raccourci jusqu'au rechargement ; l'agence
 * individuelle ne se le voit jamais proposer à tort.
 *
 * Un compte sans agence (client) le voyait avant ce ticket, et le voit toujours.
 */
export function peutProposerUnGroupe(nature: NatureDeLEspace): boolean {
  return nature === 'standard' || nature === 'sans-agence';
}

export function usePeutProposerUnGroupe(): boolean {
  const { data } = useMyProfiles();
  return peutProposerUnGroupe(natureDeLEspaceActif(data));
}
