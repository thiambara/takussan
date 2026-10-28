'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '@/lib/api';
import { patchRadarListing, radarKeys } from '@/lib/queries/radar';
import type { RadarExtracted, RadarListingChanges, RadarListingDetail, RadarListingDetailResponse } from '@/types/radar';
import { estConflitDEtape } from './gestes';

export type CleCorrigeable = keyof RadarListingChanges;

/** Les valeurs que `extracted` porte pour les champs corrigeables : la référence d'une correction. */
export function valeursLues(extracted: RadarExtracted | null): Record<CleCorrigeable, unknown> {
  const e = extracted ?? {};
  return {
    property_type: e.property_type?.value ?? null,
    contract: e.contract?.value ?? null,
    rent_period: e.rent_period?.value ?? null,
    price: e.price?.value ?? null,
    neighborhood_id: e.neighborhood?.neighborhood_id ?? null,
    city: e.city?.value ?? null,
    bedrooms: e.bedrooms?.value ?? null,
    bathrooms: e.bathrooms?.value ?? null,
    surface_m2: e.surface_m2?.value ?? null,
    furnished: e.furnished?.value ?? null,
    amenities: e.amenities?.value ?? null,
    title: e.title?.value ?? null,
    description: e.description?.value ?? null,
    advertiser_nature: e.advertiser_nature?.value ?? null,
  };
}

const egal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * TCK-2387 — les corrections d'une fiche, accumulées localement. Seuls les champs qui DIFFÈRENT de la
 * lecture y restent : revenir à la valeur lue retire la correction, et « Enregistrer » n'envoie que
 * ce qui a changé (l'API marque « corrigé » chaque clé reçue, y compris une valeur identique).
 *
 * `enregistrer()` rend `true` quand il n'y a plus rien d'en attente — rien à envoyer, ou envoyé : les
 * gestes de la tâche suivante (relire, doublon, écarter) l'attendent avant de partir, pour ne jamais
 * agir sur une fiche que l'opérateur a corrigée sans l'enregistrer.
 */
export function useCorrectionsFiche(detail: RadarListingDetail) {
  const queryClient = useQueryClient();
  const [corrections, setCorrections] = useState<Record<string, unknown>>({});
  // Change quand les corrections sont abandonnées ou enregistrées, et quand la lecture elle-même change :
  // les champs à état local (un nombre en cours de saisie) repartent alors de la valeur lue. La lecture compte
  // dans la clé parce que la fiche relue arrive APRÈS la remise à zéro des corrections.
  const [reprise, setReprise] = useState(0);
  const lues = valeursLues(detail.extracted);

  const mutation = useMutation<RadarListingDetailResponse, ApiError, RadarListingChanges>({
    mutationFn: (changes) => patchRadarListing(detail.id, changes),
    onSuccess: (reponse) => {
      queryClient.setQueryData(radarKeys.detail(detail.id), reponse);
      setCorrections({});
      setReprise((n) => n + 1);
      // Tout le Radar, rapprochements compris : un quartier rattaché ou un prix corrigé change ce que la fiche
      // ressemble déjà (sinon l'alerte n'apparaît qu'après un rechargement de la page).
      void queryClient.invalidateQueries({ queryKey: radarKeys.all });
    },
    // Un conflit d'étape : la fiche affichée est périmée, on la relit (les corrections en attente restent).
    onError: (erreur) => {
      if (estConflitDEtape(erreur)) void queryClient.invalidateQueries({ queryKey: radarKeys.detail(detail.id) });
    },
  });

  const corriger = (cle: CleCorrigeable, valeur: unknown) => {
    mutation.reset();
    setCorrections((precedentes) => {
      const suivantes = { ...precedentes };
      if (egal(valeur, lues[cle])) delete suivantes[cle];
      else suivantes[cle] = valeur;
      return suivantes;
    });
  };

  const modifie = (cle: CleCorrigeable) => cle in corrections;
  const valeur = (cle: CleCorrigeable): unknown => (cle in corrections ? corrections[cle] : lues[cle]);
  const nombre = Object.keys(corrections).length;

  const enregistrer = async (): Promise<boolean> => {
    if (nombre === 0) return true;
    try {
      await mutation.mutateAsync(corrections as RadarListingChanges);
      return true;
    } catch {
      return false;
    }
  };

  return {
    corrections,
    nombre,
    modifie,
    valeur,
    corriger,
    enregistrer,
    abandonner: () => {
      mutation.reset();
      setCorrections({});
      setReprise((n) => n + 1);
    },
    reprise: `${reprise}|${JSON.stringify(lues)}`,
    effacerErreur: () => mutation.reset(),
    enCours: mutation.isPending,
    enregistre: mutation.isSuccess,
    erreur: mutation.error,
  };
}

export type CorrectionsFiche = ReturnType<typeof useCorrectionsFiche>;
