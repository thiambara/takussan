'use client';

import { useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { ESPACE_DU_CATALOGUE } from '@/lib/libelle-equipement';
import { libelleEquipementParNom } from '@/lib/libelle-equipement-par-nom';
import type { TraducteursDeFiltre } from '@/types/search';

/**
 * Les traducteurs dont un libellé de filtre a besoin (`puceDeChaqueFiltreActif`, TCK-340) — les
 * MÊMES que les puces de `SearchToolbar` et le résumé d'une recherche sauvegardée, qui les
 * construisent encore en ligne. TCK-2475 : la barre de recherche s'en sert pour dire la saisie
 * comprise avec les libellés des filtres, jamais avec un libellé de l'API.
 */
export function useTraducteursDeFiltre(): TraducteursDeFiltre {
  const tCatalogue = useTranslations(ESPACE_DU_CATALOGUE);
  return {
    tags: useTranslations('search'),
    types: useTranslations('property.types'),
    contract: useTranslations('property.contractTypes'),
    periods: useTranslations('property.rentPeriods'),
    titleTypes: useTranslations('property.titleTypes'),
    conditions: useTranslations('property.conditions'),
    equipement: (nom) => libelleEquipementParNom(nom, tCatalogue),
    locale: useFormatteurs().locale,
  };
}
