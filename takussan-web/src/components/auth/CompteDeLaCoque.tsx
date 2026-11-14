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
 * jeton présent :
 * - un compte déjà posé n'est jamais remplacé (TCK-2158 reste la règle) ;
 * - sans jeton, rien ne se pose : une session fermée (`logout`) reste fermée ;
 * - après le montage, un `null` venu du client (`logout`, 401 de `refreshUser`) dit une session
 *   morte, et la coque, qui ne se relit pas, ne la ressuscite pas.
 *
 * ⚠ Pendant une impersonation, `AuthContext` ne reçoit aucun jeton (TCK-600) : rien ne s'y pose.
 *
 * `useLayoutEffect`, pas un effet : le compte est posé avant que le navigateur peigne l'arbre
 * hydraté. Ne rend rien.
 */
export function CompteDeLaCoque({ utilisateur }: { readonly utilisateur: User }) {
  const { user, token, setUser } = useAuth();
  const juge = useRef(false);
  useLayoutEffect(() => {
    if (juge.current) return;
    juge.current = true;
    if (user === null && token !== null) setUser(utilisateur);
  }, [user, token, utilisateur, setUser]);
  return null;
}
