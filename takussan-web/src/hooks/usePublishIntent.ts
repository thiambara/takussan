'use client';

/**
 * TCK-254, refondu par TCK-625 — où mène le bouton « Publier ».
 *
 * La décision, en une règle :
 * - **anonyme** → la connexion, qui ramène ici ;
 * - **aucun espace où publier** → l'assistant hôte (`/onboarding/host`), qui en crée un ;
 * - **un seul espace** → le formulaire du bien, après avoir rendu ce profil actif s'il ne l'est pas ;
 * - **plusieurs espaces** → le CHOIX de l'espace, sur `/publish` même.
 *
 * Un « espace où publier » est une agence où l'on porte un profil `agency_admin`, `agent` ou
 * `owner` (Q5 du relevé du 2026-10-10). Le propriétaire compte : dans une agence standard, il
 * publie une proposition (`PropertyController::store` la force en brouillon), dans une agence
 * individuelle il est l'hôte. Pour chaque agence, le profil retenu est le plus capable — admin,
 * puis agent, puis propriétaire.
 *
 * ⚠ Ce qui a été retiré : plusieurs agences menaient à `/app?selectProfile=true&next=/publish`,
 * qu'aucun écran ne lisait, et l'on atterrissait sur le tableau de bord sans rien publier. La
 * collecte lisait en outre `user.agency_id`, qui vaut `null` dès qu'on porte des profils dans deux
 * agences (TCK-142) : elle ne voyait ni l'admin multi-agences, ni le propriétaire.
 *
 * Le hook est en lecture seule : la bascule du profil actif est faite par la page.
 */

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { Profile, ProfileType } from '@/types/profile';
import type { User } from '@/types/user';

export type PublishIntentStatus =
  | 'loading'
  | 'anonymous'
  | 'host-needed'
  | 'single-space'
  | 'choose-space';

/** Un espace où publier : une agence, et le profil sous lequel on y publiera. */
export type EspaceDePublication = {
  readonly profile: Profile;
  readonly agencyId: number;
};

export type PublishIntentDecision = {
  status: PublishIntentStatus;
  /** Où mener la personne ; `null` pendant le chargement et quand elle doit choisir. */
  target: string | null;
  /** Les espaces où elle peut publier, un par agence, dans l'ordre des profils rendus. */
  espaces: EspaceDePublication[];
  /**
   * Le profil à rendre actif avant de partir (`single-space`), `null` s'il l'est déjà ou s'il n'y
   * a rien à choisir.
   */
  profilABasculer: string | null;
};

const LOGIN_TARGET = '/auth/login?redirect=/publish';
const HOST_WIZARD_TARGET = '/onboarding/host';
const NEW_PROPERTY_TARGET = '/app/properties/new';

const RANG: Partial<Record<ProfileType, number>> = { agency_admin: 0, agent: 1, owner: 2 };

/** Un espace par agence, le profil le plus capable retenu. */
export function espacesDePublication(profiles: Profile[] | undefined): EspaceDePublication[] {
  const parAgence = new Map<number, Profile>();
  for (const p of profiles ?? []) {
    const rang = RANG[p.type];
    if (rang === undefined || typeof p.agency_id !== 'number') continue;
    const deja = parAgence.get(p.agency_id);
    if (!deja || rang < (RANG[deja.type] ?? Infinity)) parAgence.set(p.agency_id, p);
  }
  return Array.from(parAgence, ([agencyId, profile]) => ({ agencyId, profile }));
}

export function decidePublishIntent(
  user: User | null,
  profiles: Profile[] | undefined,
  isLoading: boolean,
  activeProfileId: string | null = null,
): PublishIntentDecision {
  if (isLoading) {
    return { status: 'loading', target: null, espaces: [], profilABasculer: null };
  }
  if (!user) {
    return { status: 'anonymous', target: LOGIN_TARGET, espaces: [], profilABasculer: null };
  }
  const espaces = espacesDePublication(profiles);
  if (espaces.length === 0) {
    return { status: 'host-needed', target: HOST_WIZARD_TARGET, espaces, profilABasculer: null };
  }
  if (espaces.length === 1) {
    const { profile, agencyId } = espaces[0]!;
    // Le profil actif d'une AUTRE agence (un prestataire ailleurs, par exemple) ferait créer le
    // bien hors de cet espace, ou le refuser (403) : on bascule d'abord. Un profil actif de la
    // même agence suffit.
    const actif = profiles?.find((p) => p.id === activeProfileId);
    const dejaLa = actif !== undefined && actif.agency_id === agencyId && RANG[actif.type] !== undefined;
    return {
      status: 'single-space',
      target: NEW_PROPERTY_TARGET,
      espaces,
      profilABasculer: dejaLa ? null : profile.id,
    };
  }
  return { status: 'choose-space', target: null, espaces, profilABasculer: null };
}

export function usePublishIntent(): PublishIntentDecision {
  const { user, isLoading: authLoading } = useAuth();
  // `useMyProfiles` is gated on `!!user`. When anonymous, the query is
  // disabled and `data` stays undefined — that's correct: we short-circuit
  // before reading profiles.
  const profilesQuery = useMyProfiles();
  const isLoading =
    authLoading || (!!user && profilesQuery.isLoading && !profilesQuery.data);

  return useMemo(
    () =>
      decidePublishIntent(
        user,
        profilesQuery.data?.data,
        isLoading,
        profilesQuery.data?.meta?.active_profile_id ?? null,
      ),
    [user, profilesQuery.data, isLoading],
  );
}

// Exported for tests so they can assert against canonical targets without
// reaching into the module internals.
export const PUBLISH_TARGETS = {
  login: LOGIN_TARGET,
  hostWizard: HOST_WIZARD_TARGET,
  newProperty: NEW_PROPERTY_TARGET,
} as const;
