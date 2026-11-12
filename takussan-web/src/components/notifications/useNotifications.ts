'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationsReadAction,
  markNotificationUnreadAction,
} from '@/app/actions/notifications';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { AppNotification, FamilleDeNotification, NotificationsQuery, NotificationsResponse } from '@/lib/notifications';

import { familleDe } from './familles';

/**
 * TCK-2634 — les lectures et les gestes partagés par la cloche et l'historique.
 *
 * Toutes les clés commencent par `['notifications']` : un geste corrige la ligne et les comptes dans
 * CHAQUE liste en cache (la cloche, l'historique, quelle que soit la page ou la puce), puis l'historique
 * se relit — un filtre « Non lues » doit voir partir la ligne lue. La cloche, elle, se relit à son
 * prochain tour de 30 s (sans sondage plus serré).
 */
export const CLES_NOTIFICATIONS = {
  tout: ['notifications'] as const,
  cloche: (aTraiter: boolean) => ['notifications', 'cloche', aTraiter] as const,
  historique: (q: NotificationsQuery) => ['notifications', 'historique', q] as const,
  historiques: ['notifications', 'historique'] as const,
};

/** La cloche charge 20 lignes (10 avant TCK-2634) : de quoi voir un repli de plusieurs lignes. */
export const LIGNES_DE_LA_CLOCHE = 20;

async function lire(query: NotificationsQuery): Promise<NotificationsResponse> {
  const res = await getNotificationsAction(query);
  if (!res.ok) throw new RefusDuGeste(res.message);
  return res.data;
}

/**
 * La liste de la cloche : « Tout » ou « À traiter », relue toutes les 30 s (la pastille en dépend).
 * Sans `keepPreviousData` : passer de « Tout » à « À traiter » montrait les lignes de « Tout » sous la
 * puce « À traiter » le temps de la requête — le squelette dit la vérité (relevé du 2026-11-12).
 */
export function useNotificationsDeLaCloche(aTraiter: boolean) {
  return useQuery<NotificationsResponse, Error>({
    queryKey: CLES_NOTIFICATIONS.cloche(aTraiter),
    queryFn: () => lire({ perPage: LIGNES_DE_LA_CLOCHE, aTraiter }),
    refetchInterval: 30_000,
  });
}

/** Une page de l'historique, filtrée côté serveur. */
export function useHistoriqueDesNotifications(query: NotificationsQuery) {
  return useQuery<NotificationsResponse, Error>({
    queryKey: CLES_NOTIFICATIONS.historique(query),
    queryFn: () => lire(query),
    placeholderData: keepPreviousData,
  });
}

/* ── Correction des listes en cache ── */

function ajouterAuxComptes(
  meta: NotificationsResponse['meta'],
  ligne: AppNotification,
  delta: number,
): NotificationsResponse['meta'] {
  const suivant = { ...meta, unread: Math.max(0, meta.unread + delta) };
  if (!meta.counts) return suivant;
  const famille: FamilleDeNotification = familleDe(ligne);
  const parFamille = { ...meta.counts.par_famille };
  const n = Math.max(0, (parFamille[famille] ?? 0) + delta);
  if (n === 0) delete parFamille[famille];
  else parFamille[famille] = n;
  return {
    ...suivant,
    counts: {
      a_traiter_non_lues: Math.max(0, meta.counts.a_traiter_non_lues + (ligne.a_traiter ? delta : 0)),
      par_famille: parFamille,
    },
  };
}

/** Remplace des lignes par leur nouvel état et suit les comptes des non-lues. */
export function corrigerLesLignes(
  precedent: NotificationsResponse | undefined,
  lignes: readonly AppNotification[],
): NotificationsResponse | undefined {
  if (!precedent) return precedent;
  const parId = new Map(lignes.map((l) => [l.id, l]));
  let meta = precedent.meta;
  // Les comptes portent sur TOUTES les non-lues, pas sur la page : chaque ligne change de camp une fois,
  // qu'elle soit chargée dans cette liste ou non — d'où la lecture de l'état d'avant dans la page, et
  // à défaut la supposition qu'elle change bien d'état.
  for (const ligne of lignes) {
    const avant = precedent.data.find((d) => d.id === ligne.id);
    const etaitNonLue = avant ? !avant.read_at : !!ligne.read_at;
    const estNonLue = !ligne.read_at;
    if (etaitNonLue !== estNonLue) meta = ajouterAuxComptes(meta, ligne, estNonLue ? 1 : -1);
  }
  return { ...precedent, data: precedent.data.map((d) => parId.get(d.id) ?? d), meta };
}

function toutLu(precedent: NotificationsResponse | undefined): NotificationsResponse | undefined {
  if (!precedent) return precedent;
  const maintenant = new Date().toISOString();
  return {
    ...precedent,
    data: precedent.data.map((d) => ({ ...d, is_read: true, read_at: d.read_at ?? maintenant })),
    meta: {
      ...precedent.meta,
      unread: 0,
      ...(precedent.meta.counts ? { counts: { a_traiter_non_lues: 0, par_famille: {} } } : {}),
    },
  };
}

function appliquer(client: QueryClient, corriger: (r: NotificationsResponse | undefined) => NotificationsResponse | undefined) {
  client.setQueriesData<NotificationsResponse>({ queryKey: CLES_NOTIFICATIONS.tout }, corriger);
  void client.invalidateQueries({ queryKey: CLES_NOTIFICATIONS.historiques });
}

/** Le refus d'une server action : son message est déjà traduit (`failure`), il passe tel quel. */
class RefusDuGeste extends Error {}

/**
 * Les gestes : lu / non lu d'une ligne, « Tout lire » d'un repli (chacune de ses lignes), « Tout
 * lire ». Une erreur passe par `surErreur`, en MESSAGE (la surface l'écrit EN LIGNE, `role="alert"`) :
 * le refus traduit de l'action, sinon `useMessageErreurApi`. « Tout lire » d'un repli qui n'aboutit
 * qu'en partie corrige les lignes lues ET dit combien ne l'ont pas été.
 */
export function useGestesDesNotifications(surErreur: (message: string) => void, surReussite?: () => void) {
  const client = useQueryClient();
  const t = useTranslations('nav.notifications');
  const messageErreur = useMessageErreurApi();
  const direLErreur = (err: unknown) => surErreur(err instanceof RefusDuGeste ? err.message : messageErreur(err));

  const basculer = useMutation({
    mutationFn: async ({ id, lue }: { id: number; lue: boolean }) => {
      const res = lue ? await markNotificationReadAction(id) : await markNotificationUnreadAction(id);
      if (!res.ok) throw new RefusDuGeste(res.message);
      return res.data;
    },
    onSuccess: (ligne) => {
      appliquer(client, (r) => corrigerLesLignes(r, [ligne]));
      surReussite?.();
    },
    onError: direLErreur,
  });

  const lireLeRepli = useMutation({
    mutationFn: async (ids: readonly number[]) => {
      const res = await markNotificationsReadAction(ids);
      if (!res.ok) throw new RefusDuGeste(res.message);
      return res.data;
    },
    onSuccess: ({ lues, echecs }) => {
      appliquer(client, (r) => corrigerLesLignes(r, lues));
      if (echecs > 0) surErreur(t('lectureEnPartie', { count: echecs }));
      else surReussite?.();
    },
    onError: direLErreur,
  });

  const toutLire = useMutation({
    mutationFn: async () => {
      const res = await markAllNotificationsReadAction();
      if (!res.ok) throw new RefusDuGeste(res.message);
      return true;
    },
    onSuccess: () => {
      appliquer(client, toutLu);
      surReussite?.();
    },
    onError: direLErreur,
  });

  return {
    /** Marque lue (ou non lue) une ligne. */
    basculer: (n: AppNotification) => basculer.mutate({ id: n.id, lue: !n.read_at }),
    /** Ouvrir une ligne non lue la marque lue. */
    ouvrir: (n: AppNotification) => {
      if (!n.read_at) basculer.mutate({ id: n.id, lue: true });
    },
    /** « Tout lire » d'un repli : ses seules lignes non lues. */
    lireLeRepli: (lignes: readonly AppNotification[]) => {
      const ids = lignes.filter((l) => !l.read_at).map((l) => l.id);
      if (ids.length > 0) lireLeRepli.mutate(ids);
    },
    toutLire: () => toutLire.mutate(),
    enCours: basculer.isPending || lireLeRepli.isPending,
    toutLireEnCours: toutLire.isPending,
  };
}
