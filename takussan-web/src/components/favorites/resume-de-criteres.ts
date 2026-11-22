'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { filtersFromSearchParams } from '@/hooks/useSearch';
import { puceDeChaqueFiltreActif, type TraducteursDeFiltre } from '@/types/search';
import { ESPACE_DU_CATALOGUE } from '@/lib/libelle-equipement';
import { libelleEquipementParNom } from '@/lib/libelle-equipement-par-nom';
import { requeteDesCriteres as criteriaToQueryString } from '@/lib/favoris-suivi';

/*
 * TCK-2508 — module à part, et non export de `SavedSearchesList` : l'onglet « Recherches » de la
 * page publique Favoris importe ce résumé, et importer la liste de la console aurait fait entrer
 * ses couleurs dans le périmètre de contraste de la surface publique (`surface-publique.contraste`).
 * Cette liste n'était plus rendue par aucune page : retirée par TCK-2738.
 */

/**
 * `criteria` arrive du SERVEUR : c'est du JSON libre, pas un `SearchFilters`. On le repasse donc
 * par le même aller-retour URL que la page de résultats — `criteriaToQueryString` puis
 * `filtersFromSearchParams` — plutôt que de le lire à la main. Une valeur d'une version
 * antérieure, ou d'un type inattendu, retombe alors sur les mêmes lecteurs que le reste du front
 * au lieu de casser le résumé (`criteria.type` stocké en chaîne faisait planter un `.map`).
 */
/**
 * TCK-340 — le résumé d'une recherche sauvegardée passe par `puceDeChaqueFiltreActif`, la MÊME
 * fabrique de libellés que les puces de `SearchToolbar`.
 *
 * L'ancienne version était l'une des trois listes qui avaient RÉELLEMENT dérivé, et elle mentait
 * de deux façons à la fois :
 *
 * - elle ne connaissait que six clés sur dix-sept, donc une recherche sauvegardée sur
 *   « meublé, en vedette, quartier Almadies, dispo dès le 1ᵉʳ septembre » se résumait à
 *   « Aucun critère » — le repli exact d'une recherche VIDE ;
 * - elle écrivait « Vente », « ch. », « Maximum », « surface … m² » en français dur, hors
 *   next-intl, ce que le principe 5 interdit (le front possède le texte affiché).
 */
function humaniseCriteria(
  criteria: Record<string, unknown>,
  repliAucunCritere: string,
  trads: TraducteursDeFiltre,
): string {
  const filtres = filtersFromSearchParams(new URLSearchParams(criteriaToQueryString(criteria)));
  const parts = puceDeChaqueFiltreActif(filtres, trads).map((p) => p.libelle);
  return parts.length > 0 ? parts.join(' · ') : repliAucunCritere;
}

/**
 * TCK-2508 — le résumé d'une recherche sauvegardée, écrit une seule fois : l'onglet « Recherches »
 * de la page Favoris et l'accueil du client le lisent au lieu d'en tenir une seconde version.
 */
export function useResumeDeCriteres(): (criteria: Record<string, unknown>) => string {
  const t = useTranslations('search.saved');
  const tCatalogue = useTranslations(ESPACE_DU_CATALOGUE);
  const trads: TraducteursDeFiltre = {
    tags: useTranslations('search'),
    types: useTranslations('property.types'),
    contract: useTranslations('property.contractTypes'),
    periods: useTranslations('property.rentPeriods'),
    titleTypes: useTranslations('property.titleTypes'),
    conditions: useTranslations('property.conditions'),
    // TCK-633 — mêmes libellés que les puces de la recherche : le catalogue traduit, un
    // équipement d'annonceur tel quel. Le critère sauvegardé garde le NOM, seul l'affichage change.
    equipement: (nom) => libelleEquipementParNom(nom, tCatalogue),
    locale: useFormatteurs().locale,
  };
  return (criteria) => humaniseCriteria(criteria, t('noCriteria'), trads);
}
