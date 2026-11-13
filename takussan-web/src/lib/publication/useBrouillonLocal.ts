'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ResultatEcritureBrouillon, UseWizardDraftResult } from '@/hooks/useWizardDraft';

import { ouvrirBrouillonLocal, type BrouillonLocal, type EtatDuStockage, type PhotoGardee } from './brouillon-local';

/**
 * TCK-2600 — le brouillon local vu par l'assistant : la MÊME forme que `useWizardDraft` (le brouillon
 * serveur de l'assistant connecté), plus les photos et l'état du stockage. L'assistant ne sait pas
 * d'où vient son brouillon ; seule la page anonyme monte ce hook.
 *
 * L'écriture des valeurs est différée (400 ms) : une frappe ne réécrit pas IndexedDB à chaque
 * touche. `flush()` écrit tout de suite ce qui attend.
 */
export interface BrouillonLocalDeLAssistant<TData> extends UseWizardDraftResult<TData> {
  /** Les photos gardées, relues à l'ouverture. */
  readonly photos: readonly PhotoGardee[];
  readonly ecrirePhotos: (photos: readonly PhotoGardee[]) => void;
  readonly stockage: EtatDuStockage;
  /** Un brouillon de plus de 30 jours a été effacé à l'ouverture. */
  readonly purge: boolean;
  /** Il y a quelque chose à effacer : relu à l'ouverture, ou écrit depuis. */
  readonly aDuContenu: boolean;
}

const DELAI_MS = 400;

export function useBrouillonLocal<TData extends Record<string, unknown>>(
  fabriquer: () => BrouillonLocal = () => ouvrirBrouillonLocal(),
): BrouillonLocalDeLAssistant<TData> {
  const [brouillon] = useState(fabriquer);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState<UseWizardDraftResult<TData>['draft']>(null);
  const [photos, setPhotos] = useState<readonly PhotoGardee[]>([]);
  const [purge, setPurge] = useState(false);
  const [aDuContenu, setADuContenu] = useState(false);
  // « Dans ce navigateur » jusqu'à l'ouverture : le serveur n'a pas d'IndexedDB, et dire « ce
  // navigateur ne garde pas le brouillon » au premier rendu ferait diverger l'hydratation.
  const [stockage, setStockage] = useState<EtatDuStockage>({ persistance: 'navigateur', raison: null });
  const enAttente = useRef<{ etape: number; donnees: TData } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivant = true;
    void brouillon.ouvrir().then((ouvert) => {
      if (!vivant) return;
      setDraft(
        ouvert.valeurs
          ? { id: 0, key: 'local', step: ouvert.valeurs.etape, data: ouvert.valeurs.valeurs as TData, updated_at: null }
          : null,
      );
      setPhotos(ouvert.photos);
      setPurge(ouvert.purge);
      // `aDuContenu` ne se relit pas ici : l'assistant réécrit le brouillon repris à son étape
      // (`sauverBrouillon`), ce qui le pose — gardé par « Effacer ce brouillon vide le brouillon ».
      setStockage(brouillon.etat());
      setIsLoading(false);
    });
    return () => {
      vivant = false;
    };
  }, [brouillon]);

  // ⚠ Les quatre fonctions rendues gardent leur IDENTITÉ d'un rendu à l'autre (`useCallback`, comme
  // `useWizardDraft`) : l'assistant met `save` dans les dépendances de l'effet qui écrit l'étape, et une
  // fonction neuve à chaque rendu y réécrivait les valeurs à chaque rendu — jusqu'à remettre en
  // brouillon, 400 ms après, l'annonce que la publication venait d'effacer (TCK-2600). La mémoïsation
  // porte ici une sémantique : le React Compiler n'est pas appliqué sous vitest, il ne la garantit pas.
  const ecrireMaintenant = useCallback(async (): Promise<ResultatEcritureBrouillon> => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    const attente = enAttente.current;
    enAttente.current = null;
    if (!attente) return { ok: true, ecrit: false };
    await brouillon.ecrireValeurs(attente.etape, attente.donnees);
    setStockage(brouillon.etat());
    return { ok: true, ecrit: true };
  }, [brouillon]);

  const save = useCallback(
    (etape: number, donnees: TData) => {
      setADuContenu(true);
      enAttente.current = { etape, donnees };
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => void ecrireMaintenant(), DELAI_MS);
    },
    [ecrireMaintenant],
  );

  const clear = useCallback(async () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    enAttente.current = null;
    await brouillon.effacer();
    setDraft(null);
    setPhotos([]);
    setADuContenu(false);
    setStockage(brouillon.etat());
    return true;
  }, [brouillon]);

  const ecrirePhotos = useCallback(
    (suivantes: readonly PhotoGardee[]) => {
      setPhotos(suivantes);
      if (suivantes.length > 0) setADuContenu(true);
      void brouillon.ecrirePhotos(suivantes).then(() => setStockage(brouillon.etat()));
    },
    [brouillon],
  );

  // L'onglet se ferme ou passe en arrière-plan : ce qui attend part tout de suite.
  useEffect(() => {
    const auMasquage = () => {
      if (document.visibilityState === 'hidden') void ecrireMaintenant();
    };
    document.addEventListener('visibilitychange', auMasquage);
    window.addEventListener('pagehide', auMasquage);
    return () => {
      document.removeEventListener('visibilitychange', auMasquage);
      window.removeEventListener('pagehide', auMasquage);
      void ecrireMaintenant();
    };
  }, [ecrireMaintenant]);

  return {
    isLoading,
    isSaving: false,
    error: null,
    draft,
    photos,
    purge,
    aDuContenu,
    stockage,
    save,
    flush: ecrireMaintenant,
    clear,
    ecrirePhotos,
  };
}
