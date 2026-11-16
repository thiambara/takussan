'use client';

import { useSyncExternalStore } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useMyCapabilities } from '@/hooks/useCan';
import { useEspacesDuComptePublic } from '@/components/navigation-publique/useEspacePublic';

/** Ce que la fiche est : une personne (agent ou propriétaire, `id` = l'utilisateur) ou une agence. */
export type FicheIdentifiee =
  | { readonly genre: 'personne'; readonly id: number; readonly role: 'agent' | 'owner' }
  | { readonly genre: 'agence'; readonly id: number };

const sAbonner = () => () => {};

/**
 * TCK-2575 — « cette fiche publique est-elle la mienne ? », côté client seulement.
 *
 * ⚠ **Rien avant l'hydratation.** Le layout racine pose l'utilisateur dans `AuthContext` dès le rendu
 * serveur (`initialUser`) : lu directement, il ferait entrer « C'est votre fiche » dans le HTML servi,
 * qui doit rester celui d'un visiteur (la fiche est la même pour tous, AC1). `useSyncExternalStore`
 * rend `false` au serveur et à l'hydratation, `true` ensuite. Gardé par `ContactDeFiche.test.tsx`
 * (`renderToString`).
 *
 * - personne : `user.id === fiche.id` — la fiche sert l'identifiant de l'utilisateur ;
 * - agence : le profil ACTIF est dans l'agence de la fiche ET y tient `agency.update` (la règle
 *   d'`AgencyPolicy::configure`, lue sur `GET /api/me/capabilities`). Les capacités ne sont lues que
 *   lorsque l'agence active est celle de la fiche : un visiteur ne paie aucune requête de plus.
 *
 * Ce hook n'autorise rien : il évite de proposer à quelqu'un de s'écrire à lui-même.
 */
export function useFicheDeSoi(fiche: FicheIdentifiee | undefined): boolean {
  const monte = useSyncExternalStore(sAbonner, () => true, () => false);
  const { user, activeProfileId } = useAuth();
  const agence = fiche?.genre === 'agence';

  const { data: espaces } = useEspacesDuComptePublic(monte && agence ? user : null);
  const idActif = activeProfileId ?? espaces?.meta.active_profile_id ?? null;
  const agenceActive = espaces?.data.find((p) => p.id === idActif)?.agency_id ?? null;
  const dansLAgence = fiche?.genre === 'agence' && agenceActive !== null && agenceActive === fiche.id;

  const { data: capacites } = useMyCapabilities(undefined, monte && dansLAgence);

  if (!monte || !user || !fiche) return false;
  if (fiche.genre === 'personne') return user.id === fiche.id;
  return (
    dansLAgence &&
    capacites?.data.agency_id === fiche.id &&
    capacites.data.capabilities.includes('agency.update')
  );
}
