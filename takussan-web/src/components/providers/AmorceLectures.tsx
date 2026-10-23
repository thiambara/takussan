'use client';

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { LectureAmorcee } from '@/lib/queries/lectures-amorcees';

/**
 * TCK-1828 (P136.05) — amorce dans TanStack les lectures qu'une page serveur a déjà faites : les
 * composants qui lisent ces clés rendent leurs données au premier affichage, sans second appel.
 * Même patron qu'`AmorceCapacites` (TCK-1278) : `HydrationBoundary` n'écrase pas une donnée du
 * navigateur plus récente que `lueA`. Une clé absente est lue par le navigateur, comme avant.
 */
export function AmorceLectures({
  lectures,
  children,
}: {
  readonly lectures: readonly LectureAmorcee[];
  readonly children: ReactNode;
}) {
  if (lectures.length === 0) return <>{children}</>;
  const client = new QueryClient();
  for (const { cle, donnee, lueA } of lectures) client.setQueryData([...cle], donnee, { updatedAt: lueA });
  return <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>;
}
