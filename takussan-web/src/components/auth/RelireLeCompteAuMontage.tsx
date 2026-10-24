'use client';

import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

/**
 * TCK-2162 (P202.07) — relit le compte une fois, au montage.
 *
 * Pour une page serveur qui vient de changer ce que rend `/api/auth/me` : le layout racine, rendu
 * en parallèle de la page, a pu lire `/me` avant l'écriture, et le contexte garderait l'ancien
 * état. Ne se monte que sous une session (l'appelant en juge) ; ne rend rien.
 */
export function RelireLeCompteAuMontage() {
  const { refreshUser } = useAuth();
  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);
  return null;
}
