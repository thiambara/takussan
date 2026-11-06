'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useUnreadCount } from '@/components/chat-widget/useUnreadCount';
import { usePendingVisitsCount } from '@/lib/queries/visits';
import { useUnhandledLeadsCount } from '@/lib/queries/contact-leads';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import { COMPTE_DES_AVIS_EN_ATTENTE } from '@/components/admin/statut-de-la-file';
import {
  AGENCY_QUEUE_REFETCH_INTERVAL_MS,
  AGENCY_QUEUE_STALE_TIME_MS,
  propertyModerationCountQueryOptions,
} from '@/lib/queries/agency-queues';
import type { NavCounterKey } from '@/lib/navigation/types';

/** Compteurs dont le libellé accessible vit sous `nav.admin` (`pendingBadge`), pas `nav.sidebar`. */
export const COMPTEURS_DE_MODERATION: ReadonlySet<NavCounterKey> = new Set([
  'reviewModeration',
  'propertyModeration',
]);

/** Ce que la règle de sondage lit d'une entrée : son compteur et son cadenas. */
type EntreeComptee = { readonly counterKey?: NavCounterKey; readonly locked?: boolean };

/**
 * TCK-377 — AC6 : quels compteurs sont réellement sondés.
 *
 * Le sondage est armé par la PRÉSENCE de l'entrée comptée, jamais par une liste de rôles recopiée
 * à côté de la condition qui pousse l'entrée : *deux listes de rôles finissent toujours par
 * diverger, une liste dérivée non.* Une entrée cadenassée ne compte pas non plus — le cadenas
 * signifie que la page répondra 403, et un menu ne sonde pas une porte fermée.
 *
 * ⚠ **Ce paragraphe disait l'inverse jusqu'au 2026-08-27**, et la correction est le fait le plus
 * important de cet AC. Il annonçait « aucun des sept rôles ne déclenche la branche `false` », ce
 * qui était vrai du code de TCK-377 seul : `/app/visits` y était poussée sans garde de rôle. **Le
 * même lot a fusionné TCK-379, qui la retire au `service_provider`** — la branche `false` est donc
 * ATTEINTE par un rôle réel (`service_provider` → `{unreadMessages}` seul), et c'est précisément à
 * ce moment-là que plus rien ne l'observait : la mutation « les deux compteurs armés en dur »
 * laissait les 88 tests verts.
 *
 * Elle est désormais éprouvée **sur le composant monté**, rôle par rôle
 * (`AppSidebar.test.tsx`, AC6) : une fonction pure verte ne dit rien de ce que le composant en
 * fait.
 *
 * TCK-2478 — les entrées sont celles des groupes du menu composé (`entreesDuMenu`), repliés
 * compris : une entrée repliée est au menu, son compteur est sondé.
 *
 * TCK-2481 — déplacée d'`AppSidebar` (qui la ré-exporte) : la barre d'onglets mobile sonde par la
 * MÊME règle (`useCompteursDuMenu`).
 */
export function countersToPoll(entrees: readonly EntreeComptee[]): Set<NavCounterKey> {
  const keys = new Set<NavCounterKey>();
  for (const entree of entrees) {
    if (entree.counterKey && !entree.locked) keys.add(entree.counterKey);
  }
  return keys;
}

interface OptionsDesCompteurs {
  readonly agencyIsStandard?: boolean;
  /**
   * TCK-2481 — `false` : aucun sondage. La barre d'onglets est montée à toutes les largeurs mais
   * masquée dès `md` : elle n'y sonde rien. Les valeurs rendues valent alors 0 (ou le cache).
   */
  readonly actif?: boolean;
}

/**
 * TCK-2481 (ADR-0089 §5) — les compteurs du menu, sortis d'`AppSidebar` pour que la barre d'onglets
 * mobile lise LES MÊMES : mêmes hooks, mêmes clés de cache, même cadence, même règle « 0 pendant le
 * chargement ET sur une erreur » (TCK-2479). Un compteur n'est sondé que si une entrée rendue et non
 * cadenassée le porte (TCK-377).
 */
export function useCompteursDuMenu(
  entrees: readonly EntreeComptee[],
  { agencyIsStandard, actif = true }: OptionsDesCompteurs = {},
): Record<NavCounterKey, number> {
  const { token } = useAuth();
  const sondes = actif ? countersToPoll(entrees) : new Set<NavCounterKey>();
  const unreadMessages = useUnreadCount({ enabled: sondes.has('unreadMessages') });
  const pendingVisits = usePendingVisitsCount({ enabled: sondes.has('pendingVisits') });
  const unhandledLeads = useUnhandledLeadsCount({ enabled: sondes.has('unhandledLeads') });
  // TCK-649 — les deux files de modération, reprises à l'identique de la barre de l'ancienne
  // console (TCK-098) : mêmes clés de cache — celle des biens est partagée avec le bloc de files du
  // tableau de bord d'agence (TCK-375), qui vit désormais dans la MÊME coque —, même cadence.
  const { data: avisEnAttente, isError: avisEnErreur } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    // TCK-2479 (revue, I3) — le total de la vue où mène la pastille, pas `pending_count` : voir
    // `COMPTE_DES_AVIS_EN_ATTENTE`.
    queryFn: () => fetchModerationQueue(token ?? '', COMPTE_DES_AVIS_EN_ATTENTE).then((r) => r.meta),
    enabled: Boolean(token) && sondes.has('reviewModeration'),
    refetchInterval: AGENCY_QUEUE_REFETCH_INTERVAL_MS,
    staleTime: AGENCY_QUEUE_STALE_TIME_MS,
  });
  const optionsBiens = propertyModerationCountQueryOptions(token ?? null, agencyIsStandard);
  const { data: biensEnAttente, isError: biensEnErreur } = useQuery({
    ...optionsBiens,
    enabled: optionsBiens.enabled && sondes.has('propertyModeration'),
  });
  // TCK-2479 (ADR-0089 §5) — 0 pendant le chargement ET sur une erreur, premier échec ou relecture
  // ratée (react-query garde alors l'ancien `data` : ce commentaire disait « une requête en échec
  // rend `data === undefined` », vrai du premier échec seulement). C'est la même branche que « rien
  // en attente » — délibérément : le menu n'est pas l'endroit où l'on apprend qu'un endpoint est
  // tombé. Le badge du menu, la bande et la barre d'onglets lisent ce MÊME objet.
  const total = (q: {
    readonly data?: { readonly meta?: { readonly total?: number } };
    readonly isError?: boolean;
  }) => (q.isError ? 0 : (q.data?.meta?.total ?? 0));
  return {
    unreadMessages,
    pendingVisits: total(pendingVisits),
    unhandledLeads: total(unhandledLeads),
    reviewModeration: avisEnErreur ? 0 : (avisEnAttente?.total ?? 0),
    propertyModeration: biensEnErreur ? 0 : (biensEnAttente ?? 0),
  };
}
