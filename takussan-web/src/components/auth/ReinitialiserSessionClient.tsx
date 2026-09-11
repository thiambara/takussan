'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-509 — les pages `/auth/*` n'existent que SANS session : `src/proxy.ts` renvoie vers `/app`
 * tout visiteur qui y arrive avec le cookie. Y monter avec un jeton dans le contexte client veut
 * donc dire qu'une session s'est fermée sans que le client l'apprenne — l'expiration
 * (`getMeAction` → 401 → `/api/auth/session-expired`, qui efface le cookie puis renvoie vers
 * `/auth/login`), ou tout chemin futur qui contournerait `useAuth().logout`.
 *
 * Sans cette remise à zéro, la page de connexion continue d'interroger l'API avec le jeton mort —
 * mesuré le 2026-09-10 : le sondage de `conversations` en 401 sur `/auth/login` —, et le compte
 * connecté ensuite garde le cache de l'ancien.
 *
 * ⚠ Ne juge que l'état AU MONTAGE. La connexion ouvre une session pendant que ce composant est
 * monté (`openSession`, puis navigation vers la destination) : la refermer aussitôt serait le
 * défaut inverse.
 */
export function ReinitialiserSessionClient() {
  const { token, user, logout } = useAuth();
  const [sessionAuMontage] = useState(() => token !== null || user !== null);

  useEffect(() => {
    if (sessionAuMontage) void logout();
  }, [sessionAuMontage, logout]);

  return null;
}
