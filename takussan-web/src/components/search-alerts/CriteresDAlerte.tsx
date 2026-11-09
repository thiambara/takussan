'use client';

import { useTranslations } from 'next-intl';

import { filtersFromSearchParams } from '@/hooks/useSearch';
import { requeteDesCriteres } from '@/lib/favoris-suivi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { ESPACE_DU_CATALOGUE } from '@/lib/libelle-equipement';
import { libelleEquipementParNom } from '@/lib/libelle-equipement-par-nom';
import { puceDeChaqueFiltreActif, type TraducteursDeFiltre } from '@/types/search';

/**
 * TCK-2514 — les critères d'une alerte en pastilles, sur les pages où mènent ses liens.
 *
 * Les `criteria` viennent de l'API (vocabulaire fermé, TCK-2513) : ils repassent par le même aller-
 * retour d'URL que la liste des recherches sauvegardées, puis par `puceDeChaqueFiltreActif`, la
 * fabrique des puces de la recherche. Une clé sans libellé sûr n'a pas de pastille : on n'invente rien.
 */
export function usePucesDAlerte(): (criteria: Record<string, unknown>) => string[] {
  const tCatalogue = useTranslations(ESPACE_DU_CATALOGUE);
  const trads: TraducteursDeFiltre = {
    tags: useTranslations('search'),
    types: useTranslations('property.types'),
    contract: useTranslations('property.contractTypes'),
    periods: useTranslations('property.rentPeriods'),
    titleTypes: useTranslations('property.titleTypes'),
    conditions: useTranslations('property.conditions'),
    equipement: (nom) => libelleEquipementParNom(nom, tCatalogue),
    locale: useFormatteurs().locale,
  };
  return (criteria) =>
    puceDeChaqueFiltreActif(filtersFromSearchParams(new URLSearchParams(requeteDesCriteres(criteria))), trads).map(
      (p) => p.libelle,
    );
}

export function CriteresDAlerte({ puces }: { readonly puces: readonly string[] }) {
  const t = useTranslations('lienPublic.alerte');
  if (puces.length === 0) return null;
  return (
    <ul className="mx-auto flex max-w-[22rem] flex-wrap justify-center gap-1.5" aria-label={t('criteres')} data-testid="alerte-criteres">
      {puces.map((p) => (
        <li key={p} className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-sm font-medium text-primary-deep">
          {p}
        </li>
      ))}
    </ul>
  );
}
