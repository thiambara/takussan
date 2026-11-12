'use client';

import { useState } from 'react';

import { useBoostProducts, useBuyBoost, useCredits, usePropertyBoosts } from './api';
import { effetAchat } from './effet-achat';
import { manqueDeCredits, type BoostProduct } from './types';

/**
 * TCK-2664 — LES RÈGLES d'un achat de mise en avant, sans texte, partagées par les deux points
 * d'entrée : le dialogue de la page d'un bien (`BoostDialog`) et le parcours de la page Crédits
 * (`MettreEnAvant`). Aucun des deux ne les réécrit : solde et montant manquant dits AVANT la
 * confirmation, effet sur le boost en place (TCK-824), refus `credits.insufficient` du serveur, clé
 * d'idempotence (TCK-822).
 *
 * La clé d'idempotence naît à l'ouverture et porte le BIEN et l'OFFRE : un « Confirmer » repris après
 * une réponse perdue ne débite pas deux fois, et choisir un autre bien ou une autre offre est un autre
 * achat (l'API refuserait un corps différent sous la même clé). Elle renaît après un achat réussi et à
 * la fermeture (`reinitialiser`).
 */
function nouvelleOuverture(): string {
  return globalThis.crypto.randomUUID();
}

export function useAchatDeBoost({
  propertyId,
  ouvert,
  choixInitial = null,
}: {
  readonly propertyId: number | null;
  readonly ouvert: boolean;
  /** L'offre déjà choisie à l'ouverture (« Remonter · 5 », « Relancer · 20 »). */
  readonly choixInitial?: number | null;
}) {
  const credits = useCredits(ouvert);
  const offres = useBoostProducts(ouvert);
  const [choix, setChoix] = useState<number | null>(choixInitial);
  const [ouverture, setOuverture] = useState(nouvelleOuverture);
  const achat = useBuyBoost(propertyId ?? 0, `${ouverture}-${propertyId ?? 0}-${choix ?? 0}`);
  const enPlace = usePropertyBoosts(propertyId ?? 0, ouvert && propertyId !== null);
  const [maintenant] = useState(() => Date.now());

  const solde = credits.data?.data.balance ?? 0;
  const liste = offres.data?.data ?? [];
  const offre = liste.find((p) => p.id === choix) ?? null;
  const manqueDe = (p: BoostProduct) => Math.max(0, p.price_credits - solde);

  return {
    solde,
    lots: credits.data?.data.lots ?? [],
    offres: liste,
    choix,
    choisir: setChoix,
    offre,
    /** Ce qu'il manque pour l'offre choisie (0 : couverte). */
    manque: offre ? manqueDe(offre) : 0,
    manqueDe,
    /** Le refus du serveur, si le solde a changé entre l'affichage et la confirmation. */
    refusSolde: manqueDeCredits(achat.error),
    effet: effetAchat(offre, enPlace.data?.data ?? [], enPlace.data?.bump_available_at ?? null, maintenant),
    chargement: credits.isLoading || offres.isLoading || (propertyId !== null && enPlace.isLoading),
    echec: credits.isError || offres.isError || (propertyId !== null && enPlace.isError),
    /** Le solde et les offres seuls : le parcours de la page Crédits ne masque pas tout pour un bien. */
    chargementDesOffres: credits.isLoading || offres.isLoading,
    echecDesOffres: credits.isError || offres.isError,
    /** Les boosts en place du bien choisi : tant qu'ils se lisent, l'effet de l'achat n'est pas connu. */
    chargementDuBien: propertyId !== null && enPlace.isLoading,
    echecDuBien: propertyId !== null && enPlace.isError,
    relire: () => {
      void credits.refetch();
      void offres.refetch();
      if (propertyId !== null) void enPlace.refetch();
    },
    achat,
    /** Confirme l'offre choisie si le solde la couvre ; la clé renaît après la réussite. */
    confirmer: (onSuccess?: () => void) => {
      if (!offre || manqueDe(offre) > 0 || propertyId === null) return;
      achat.mutate(
        { product_id: offre.id },
        {
          onSuccess: () => {
            setOuverture(nouvelleOuverture());
            onSuccess?.();
          },
        },
      );
    },
    reinitialiser: () => {
      setChoix(null);
      setOuverture(nouvelleOuverture());
      achat.reset();
    },
  };
}
