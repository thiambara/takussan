'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { SaveSearchButton } from '@/components/favorites/SaveSearchButton';
import { PucesDeFiltres } from '@/components/search/SearchToolbar';
import type { SearchFilters } from '@/types/search';

export interface SearchEmptyProps {
  readonly filters: SearchFilters;
  readonly activeCount: number;
  /**
   * Le TOTAL de la recherche est nul — les critères sont en cause. Faux quand seule la PAGE est
   * vide (au-delà de la dernière) : les biens existent, la barre d'outils garde alors ses puces
   * et sa sauvegarde, et l'état vide ne les répète pas.
   */
  readonly criteresEnCause: boolean;
  /** Le MÊME retrait que les puces de la barre d'outils — valeurs multiples comprises. */
  readonly onRemoveFilter: (key: keyof SearchFilters, subKey?: string) => void;
  readonly onReset: () => void;
}

/**
 * L'état vide de la liste publique — TCK-558.
 *
 * Il ne CONSTATE plus rien : le compteur de la barre d'outils le fait déjà (« Aucun bien
 * trouvé »), et l'écran le disait deux fois (E1). Son titre dit quoi faire, et ses issues sont,
 * dans l'ordre :
 *
 *  1. **chaque critère actif, retirable seul** — la puce de la barre d'outils, même rendu
 *     ({@link PucesDeFiltres}) et même chemin (`onRemoveFilter` de la page). Un visiteur retire
 *     LE critère de trop sans perdre les autres ; la barre d'outils n'en rend alors aucune,
 *     sinon la même rangée paraîtrait deux fois ;
 *  2. **la sauvegarde**, l'issue positive — c'est précisément à zéro résultat qu'on veut
 *     retrouver cette recherche plus tard. ⚠ Elle SAUVEGARDE (`notification_frequency: 'off'`),
 *     elle ne crée aucune alerte : aucun texte d'ici ne promet d'être prévenu ;
 *  3. **« Effacer tous les filtres »**, en second et en style discret (`ghost`). Il reste offert
 *     sans aucun critère : c'est alors la seule sortie.
 *
 * Une page AU-DELÀ de la dernière rend aussi une liste vide, mais le total n'y est pas nul
 * (`criteresEnCause` faux) : ni puce ni sauvegarde ici — la barre d'outils les porte déjà —, et
 * un titre qui ne dit pas d'élargir une recherche qui trouve des biens.
 *
 * Aucune requête de plus pour « deviner » le filtre le plus restrictif (hors périmètre).
 */
export function SearchEmpty({
  filters,
  activeCount,
  criteresEnCause,
  onRemoveFilter,
  onReset,
}: SearchEmptyProps) {
  const t = useTranslations('search.results');
  const aDesCriteres = criteresEnCause && activeCount > 0;
  const description = !criteresEnCause
    ? t('vide_description_hors_pages')
    : aDesCriteres
      ? t('vide_description')
      : t('vide_description_sans_critere');
  return (
    // `col-span-full` : ce bloc vit DANS la grille de résultats. C'est la raison pour laquelle
    // `EmptyState` spread ses props résiduelles et accepte `className`.
    <EmptyState
      data-etat="vide-recherche"
      className="col-span-full px-4 py-8 sm:p-10"
      icon={<SearchX className="size-8" aria-hidden="true" />}
      title={criteresEnCause ? t('vide_titre') : t('vide_titre_hors_pages')}
      description={description}
      action={
        <div className="flex flex-col items-center gap-4">
          {criteresEnCause ? (
            <PucesDeFiltres
              filters={filters}
              onRemoveFilter={onRemoveFilter}
              className="justify-center"
              aria-label={t('vide_criteres_aria')}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {aDesCriteres ? <SaveSearchButton filters={filters} activeCount={activeCount} /> : null}
            <Button type="button" variant="ghost" className="rounded-full" onClick={onReset}>
              {t('empty_cta')}
            </Button>
          </div>
        </div>
      }
    />
  );
}
