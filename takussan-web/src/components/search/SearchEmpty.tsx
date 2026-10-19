'use client';

import React, { useId } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { SaveSearchButton } from '@/components/favorites/SaveSearchButton';
import { PucesDeFiltres } from '@/components/search/SearchToolbar';
import { urlDeSuggestion, type SuggestItem } from '@/components/search/SearchAutocomplete';
import { useSuggest } from '@/hooks/useSuggest';
import { definitionDe, type SearchFilters } from '@/types/search';
import type { Locale } from '@/i18n/config';

/** Au plus autant de suggestions : l'état vide propose une issue, pas un second index. */
const SUGGESTIONS_MAX = 6;

/**
 * TCK-911 (P01.09) — les suggestions de la barre de recherche (`SuggestService` : villes,
 * quartiers, types), proposées quand le terme n'a rien trouvé. Avant, `ker` rendait 0 et aucune
 * piste : le repli conjonctif exige deux termes, et la tolérance aux fautes, cinq lettres.
 *
 * ⚠ Une suggestion REMPLACE le terme : `q` (et son alias `search`) est retiré de l'URL, puisque
 * c'est lui qui ne trouve rien ; les autres critères restent, comme depuis la barre
 * ({@link urlDeSuggestion}). Pour la même raison, aucun compte n'est affiché : celui de
 * `SuggestService` est pris sur tout le catalogue public, et les critères gardés le réduisent.
 *
 * Rien n'est rendu tant que la réponse n'est pas là, ni quand elle est vide : pas de squelette
 * pour une issue facultative.
 */
function SuggestionsDuVide({ terme }: { readonly terme: string }) {
  const t = useTranslations('search.results');
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const titreId = useId();
  const { data } = useSuggest(terme);
  const reponse = data?.data;
  const items: SuggestItem[] = [
    ...(reponse?.cities ?? []).map((d): SuggestItem => ({ kind: 'city', data: d })),
    ...(reponse?.neighborhoods ?? []).map((d): SuggestItem => ({ kind: 'neighborhood', data: d })),
    ...(reponse?.property_types ?? []).map((d): SuggestItem => ({ kind: 'property_type', data: d })),
  ].slice(0, SUGGESTIONS_MAX);
  if (items.length === 0) return null;

  const base = new URLSearchParams(searchParams.toString());
  for (const p of definitionDe('q').params) base.delete(p);

  return (
    <nav aria-labelledby={titreId} className="flex flex-col items-center gap-2">
      <p id={titreId} className="text-sm font-medium text-foreground">
        {t('vide_suggestions')}
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {items.map((item) => {
          const libelle = item.kind === 'neighborhood' ? `${item.data.label}, ${item.data.city}` : item.data.label;
          return (
            <li key={`${item.kind}-${libelle}`}>
              <Link
                href={urlDeSuggestion(item, base, locale)}
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 text-sm text-foreground underline-offset-2 hover:bg-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface SearchEmptyProps {
  readonly filters: SearchFilters;
  /** TCK-580 — passé tel quel aux puces : cf. `PucesDeFiltres`. */
  readonly filtresDesResultats?: SearchFilters;
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
 *     elle ne crée aucune alerte : aucun texte d'ici ne promet d'être prévenu. Depuis TCK-599,
 *     l'alerte est une case DÉCOCHÉE dans la boîte qu'elle ouvre, et la confirmation dit ce qui a
 *     été créé ; le visiteur sans compte y trouve « Me prévenir », qui demande son contact ;
 *  3. **« Effacer tous les filtres »**, en second et en style discret (`ghost`). Il reste offert
 *     sans aucun critère : c'est alors la seule sortie.
 *
 * Une page AU-DELÀ de la dernière rend aussi une liste vide, mais le total n'y est pas nul
 * (`criteresEnCause` faux) : ni puce ni sauvegarde ici — la barre d'outils les porte déjà —, et
 * un titre qui ne dit pas d'élargir une recherche qui trouve des biens.
 *
 * Aucune requête de plus pour « deviner » le filtre le plus restrictif (hors périmètre). Une seule
 * requête s'ajoute, et seulement sur un terme : les suggestions de la barre ({@link SuggestionsDuVide}).
 */
export function SearchEmpty({
  filters,
  filtresDesResultats,
  activeCount,
  criteresEnCause,
  onRemoveFilter,
  onReset,
}: SearchEmptyProps) {
  const t = useTranslations('search.results');
  const aDesCriteres = criteresEnCause && activeCount > 0;
  const terme = criteresEnCause ? (filters.q ?? '').trim() : '';
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
          {terme ? <SuggestionsDuVide terme={terme} /> : null}
          {criteresEnCause ? (
            <PucesDeFiltres
              filters={filters}
              filtresDesResultats={filtresDesResultats}
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
