'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-743 (P33.02) — **la garde du widget de messagerie, seule dans le JS initial.**
 *
 * Monté par le layout racine, le widget était importé par TOUTES les routes, avec la messagerie,
 * zod et react-hook-form (`ChatView`), alors qu'il ne rend rien au visiteur anonyme. Mesuré le
 * 2026-10-17 (angle 33) : une page légale passait de 450 à 322 Kio de JS initial gzip sans lui.
 *
 * Le corps (`CorpsDuWidget`) est désormais un morceau à part, que `next/dynamic` ne demande qu'au
 * premier rendu, donc pour un utilisateur connecté seulement. Le rendu serveur est gardé : pour un
 * connecté, le lanceur reste dans le HTML comme avant.
 *
 * ⚠ N'ajouter ici aucun import du corps ni de la messagerie : ce fichier est dans le graphe du
 * layout racine. Garde : `src/app/__tests__/js-initial-du-layout-racine.test.ts`.
 */
const CorpsDuWidget = dynamic(() => import('./CorpsDuWidget').then((m) => m.CorpsDuWidget));

export function ChatWidget() {
  const { user } = useAuth();
  if (!user) return null;
  return <CorpsDuWidget />;
}
