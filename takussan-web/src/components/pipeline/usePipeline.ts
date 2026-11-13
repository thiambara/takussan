'use client';

import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { useCustomerStageMutation } from '@/hooks/useCustomerStageMutation';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { cleDeLaListe, cleDesFiltres, ETAPES_TERMINALES, type EtatDuPipeline, filtresDeLaListe, filtresDesColonnes, parametresDesStats, type SegmentDuPipeline } from '@/lib/crm/pipeline';
import { PIPELINE_COLUMN_PAGE_SIZE, type PagePipeline, dismissSuggestedStage, fetchPipelineColumn, fetchPipelineList, fetchPipelineStats } from '@/lib/queries/pipeline';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

/**
 * TCK-2592 — les lectures et les gestes du pipeline, partagés par la Liste, les Étapes et le téléphone :
 * les statistiques et les colonnes pour UNE portée et UNS filtres (`lib/crm/pipeline`), le changement
 * d'étape (le motif d'abord pour Gagné et Perdu), « Plus tard » sur l'étape proposée.
 */

export function useStatsDuPipeline(etat: EtatDuPipeline) {
  const { token } = useAuth();
  const cle = cleDesFiltres(etat);
  return useQuery({
    queryKey: PIPELINE_QUERY_KEY.stats(cle),
    queryFn: () => fetchPipelineStats(token as string, parametresDesStats(etat)),
    enabled: !!token,
    staleTime: 60_000,
  });
}

/**
 * Une colonne par étape demandée, sous la clé de ses filtres. Une relecture (focus après le
 * `staleTime`, remontage) relit autant de pages que « Charger plus » en a ajouté (TCK-1913).
 */
export function useColonnesDuPipeline(etat: EtatDuPipeline, etapes: readonly CustomerPipelineStage[]) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const t = useTranslations('crm.pipeline');
  const cle = cleDesFiltres(etat);
  const filtres = filtresDesColonnes(etat);
  const [chargeant, setChargeant] = useState<CustomerPipelineStage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const colonnes = useQueries({
    queries: etapes.map((stage) => ({
      queryKey: PIPELINE_QUERY_KEY.column(stage, cle),
      queryFn: async () => {
        if (!token) return [] as PipelineCustomerCard[];
        const deja = queryClient.getQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column(stage, cle));
        const pages = Math.max(1, Math.ceil((deja?.length ?? 0) / PIPELINE_COLUMN_PAGE_SIZE));
        const lues = await Promise.all(Array.from({ length: pages }, (_, i) => fetchPipelineColumn(token, i === 0 ? { stage, filtres } : { stage, filtres, page: i + 1 })));
        const vus = new Set<number>();
        return lues.flat().filter((c) => (vus.has(c.id) ? false : (vus.add(c.id), true)));
      },
      enabled: !!token,
      staleTime: 30_000,
    })),
  });

  const cartes = (stage: CustomerPipelineStage): PipelineCustomerCard[] => (colonnes[etapes.indexOf(stage)]?.data ?? []) as PipelineCustomerCard[];

  const etatDe = (stage: CustomerPipelineStage) => {
    const q = colonnes[etapes.indexOf(stage)];
    // `isPending` seul : le serveur rend `idle` là où le premier rendu client rend `fetching` (hydratation).
    return { isLoading: !!token && !!q?.isPending, isError: !!q?.isError, onRetry: () => void q?.refetch() };
  };

  const chargerPlus = async (stage: CustomerPipelineStage) => {
    if (!token || chargeant) return;
    const deja = cartes(stage);
    setChargeant(stage);
    try {
      const page = Math.floor(deja.length / PIPELINE_COLUMN_PAGE_SIZE) + 1;
      const suite = await fetchPipelineColumn(token, { stage, filtres, page });
      queryClient.setQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column(stage, cle), (old) => {
        const vus = new Set((old ?? []).map((c) => c.id));
        return [...(old ?? []), ...suite.filter((c) => !vus.has(c.id))];
      });
    } catch (err) {
      setErreur(messageErreur(err, t('errors.loadFailed')));
    } finally {
      setChargeant(null);
    }
  };

  return { cartes, etatDe, chargerPlus, chargeant, erreur, effacerErreur: () => setErreur(null) };
}

export interface MotifEnAttente {
  readonly prospect: PipelineCustomerCard;
  readonly from: CustomerPipelineStage;
  readonly to: CustomerPipelineStage;
}

/** Le changement d'étape : direct vers une étape vivante, par le motif vers Gagné ou Perdu. */
export function useChangementDEtape() {
  const t = useTranslations('crm.pipeline');
  const messageErreur = useMessageErreurApi();
  const mutation = useCustomerStageMutation();
  const [motif, setMotif] = useState<MotifEnAttente | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const executer = (prospect: PipelineCustomerCard, to: CustomerPipelineStage, reason?: string, apres?: () => void) => {
    mutation.mutate(
      { customerId: prospect.id, from: prospect.pipeline_stage, to, reason },
      {
        onSuccess: () => apres?.(),
        onError: (err) => {
          // Un refus dans le motif se dit DANS le dialogue, qui garde le texte (P244.01) ; ailleurs, en alerte.
          if (!reason) setErreur(messageErreur(err, t('errors.moveFailed')));
        },
      },
    );
  };

  const changer = (prospect: PipelineCustomerCard, to: CustomerPipelineStage) => {
    if (prospect.pipeline_stage === to) return;
    if ((ETAPES_TERMINALES as readonly string[]).includes(to)) {
      // P244.01 (TCK-2361) — un dialogue neuf ne reprend pas le refus d'un envoi précédent.
      mutation.reset();
      setMotif({ prospect, from: prospect.pipeline_stage, to });
      return;
    }
    executer(prospect, to);
  };

  return {
    changer,
    motif,
    annulerMotif: () => setMotif(null),
    // Fermé sur le succès seulement (TCK-2212) : un refus garde le motif saisi et le dit.
    enregistrerMotif: (reason: string) => {
      if (motif) executer(motif.prospect, motif.to, reason, () => setMotif(null));
    },
    erreurDuMotif: motif !== null && mutation.error ? messageErreur(mutation.error, t('errors.moveFailed')) : null,
    enCours: mutation.isPending,
    erreur,
    effacerErreur: () => setErreur(null),
  };
}

/** « Plus tard » : écarte la proposition vue ; un 409 dit qu'elle a changé entre-temps. */
export function usePlusTard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, PipelineCustomerCard>({
    mutationFn: async (p) => {
      if (!token) throw new ApiError(401, { message: 'unauthenticated' });
      if (!p.suggested_stage) return;
      await dismissSuggestedStage(token, p.id, p.suggested_stage.reason);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.root() }),
  });
}

/**
 * Une liste (relances, vue Liste) : les étapes vivantes triées par retard, page après page ; une
 * relecture relit autant de pages qu'en a ajouté « Charger plus ». `parPage=1` : un compte seul.
 */
export function useListeDuPipeline(etat: EtatDuPipeline, segment: SegmentDuPipeline, options: { readonly parPage?: number; readonly actif?: boolean } = {}) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const parPage = options.parPage ?? PIPELINE_COLUMN_PAGE_SIZE;
  const filtres = filtresDeLaListe(etat, segment);
  const cle = PIPELINE_QUERY_KEY.list(`${cleDeLaListe(etat, segment)}&per_page=${parPage}`, segment);
  const [chargeant, setChargeant] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const messageErreur = useMessageErreurApi();
  const t = useTranslations('crm.pipeline');

  const q = useQuery({
    queryKey: cle,
    queryFn: async (): Promise<PagePipeline> => {
      const deja = queryClient.getQueryData<PagePipeline>(cle);
      const pages = Math.max(1, Math.ceil((deja?.lignes.length ?? 0) / parPage));
      const lues = await Promise.all(Array.from({ length: pages }, (_, i) => fetchPipelineList(token as string, { filtres, perPage: parPage, page: i + 1 })));
      const vus = new Set<number>();
      return { lignes: lues.flatMap((p) => p.lignes).filter((c) => (vus.has(c.id) ? false : (vus.add(c.id), true))), total: lues[lues.length - 1]?.total ?? 0 };
    },
    enabled: !!token && options.actif !== false,
    staleTime: 30_000,
  });

  const chargerPlus = async () => {
    if (!token || chargeant || !q.data) return;
    setChargeant(true);
    try {
      const page = Math.floor(q.data.lignes.length / parPage) + 1;
      const suite = await fetchPipelineList(token, { filtres, perPage: parPage, page });
      queryClient.setQueryData<PagePipeline>(cle, (old) => {
        const vus = new Set((old?.lignes ?? []).map((c) => c.id));
        return { lignes: [...(old?.lignes ?? []), ...suite.lignes.filter((c) => !vus.has(c.id))], total: suite.total };
      });
    } catch (err) {
      // Les lignes déjà lues restent ; la panne se dit (en alerte, par la page), « Charger plus » reste là.
      setErreur(messageErreur(err, t('errors.loadFailed')));
    } finally {
      setChargeant(false);
    }
  };

  return { ...q, lignes: q.data?.lignes ?? [], total: q.data?.total, chargerPlus, chargeant, erreur, effacerErreur: () => setErreur(null) };
}
