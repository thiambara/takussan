'use client';

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { CLE_CAPACITES_ACTIVES, type LectureDesCapacites } from '@/lib/access/capacites-amorcees';

/**
 * TCK-1278 (P136.02) — amorce la clé `['me','capabilities','active']` avec la lecture que le layout
 * serveur de `/app` a déjà faite : `useCan` répond au premier rendu, sans squelette ni second
 * `GET /api/me/capabilities`.
 *
 * `HydrationBoundary` n'écrase jamais une donnée du navigateur plus récente que `lueA` (une
 * relecture après une édition de rôle), et réamorce après un rafraîchissement du serveur. Sans
 * lecture (`null`), rien n'est amorcé et le navigateur lit comme avant. L'API reste seule juge.
 */
export function AmorceCapacites({
  lecture,
  children,
}: {
  readonly lecture: LectureDesCapacites | null;
  readonly children: ReactNode;
}) {
  if (lecture === null) return <>{children}</>;
  const client = new QueryClient();
  client.setQueryData([...CLE_CAPACITES_ACTIVES], { data: lecture.reponse }, { updatedAt: lecture.lueA });
  return <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>;
}
