'use client';

import { useLayoutEffect, useRef } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { User } from '@/lib/auth';

/**
 * TCK-2765 — la console pose dans `AuthContext` le compte que sa coque a lu.
 *
 * Le layout racine borne sa lecture de `/api/auth/me` à `DELAI_ME_RACINE_MS` (TCK-1217) ; au-delà,
 * `AuthProvider` naît avec `user = null`. La coque de `/app` attend la même lecture sans borne
 * (`getMeAction`) et affiche la navigation du personnel, pendant que les lecteurs de
 * `useAuth().user` — l'état vide de la messagerie, entre autres — rendaient un visiteur.
 *
 * La pose n'a lieu qu'UNE fois, au montage, et seulement si le contexte n'a aucun compte sous un
 * jeton présent — ou sous une impersonation dite par le serveur (TCK-2802, ci-dessous) :
 * - un compte déjà posé n'est jamais remplacé (TCK-2158 reste la règle) ;
 * - sans jeton hors impersonation, rien ne se pose : une session fermée (`logout`) reste fermée ;
 * - après le montage, un `null` venu du client (`logout`, 401 de `refreshUser`) dit une session
 *   morte, et la coque, qui ne se relit pas, ne la ressuscite pas.
 *
 * TCK-2802 — pendant une impersonation, `AuthContext` ne reçoit aucun jeton (TCK-600, ADR-0055
 * § 6) : l'absence de jeton n'y dit pas une session fermée. C'est la coque, côté serveur, qui dit
 * qu'une impersonation est en cours (`estEnImpersonation`, qui lit le cookie `httpOnly`), par un
 * booléen sans secret — le témoin `impersonation_active` en dit déjà autant au navigateur. Ce
 * signal tient lieu de jeton, et de lui seul : les autres gardes ne changent pas. Le compte posé
 * est celui que la coque a lu sous le jeton d'impersonation, donc celui de la cible.
 *
 * Sous impersonation, le signal reste vrai après une déconnexion ou un 401 de `refreshUser` :
 * c'est le jugement unique (`juge`) qui empêche alors la coque de les annuler.
 *
 * `useLayoutEffect`, pas un effet : le compte est posé avant que le navigateur peigne l'arbre
 * hydraté. Ne rend rien.
 */
export function CompteDeLaCoque({
  utilisateur,
  impersonation = false,
}: {
  readonly utilisateur: User;
  readonly impersonation?: boolean;
}) {
  const { user, token, setUser } = useAuth();
  const juge = useRef(false);
  useLayoutEffect(() => {
    if (juge.current) return;
    juge.current = true;
    if (user === null && (token !== null || impersonation === true)) setUser(utilisateur);
  }, [user, token, impersonation, utilisateur, setUser]);
  return null;
}
