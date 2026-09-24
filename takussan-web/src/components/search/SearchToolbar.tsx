'use client';

import React, { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  puceDeChaqueFiltreActif,
  type SearchFilters,
  type TraducteursDeFiltre,
} from '@/types/search';

const SORT_VALUES = ['relevance', 'price_asc', 'price_desc', 'created_desc'] as const;

/**
 * TCK-346 — `distance` n'est proposé QUE lorsqu'une origine existe.
 *
 * Le serveur rend 422 sur `sort=distance` sans `lat`/`lng`
 * (`SearchPublicPropertyRequest::rules()`), et il a raison : sans origine, le tri n'a pas de
 * sens. Le refuser en 422 vaut mieux qu'un repli silencieux sur le tri par défaut — mais une
 * option qui produit un 422 à coup sûr n'a rien à faire dans une liste déroulante. Elle
 * apparaît donc avec le point et disparaît avec lui.
 */
const TRI_DISTANCE = 'distance' as const;

/**
 * TCK-340 — la table des libellés et la liste des clés masquées vivaient ICI, en double de
 * `useSearch.ts`, et le lien entre les deux n'était pas vérifiable.
 *
 * Elles sont maintenant dans `SEARCH_FILTER_KEYS` (`types/search.ts`) : une clé de rôle
 * `'filtre'` DOIT porter un libellé, sous peine d'erreur de compilation. Ce qui reste ici est
 * le rendu — et rien d'autre.
 *
 * Ce que le déplacement supprime au passage : `FILTER_LABELS['type']!`, une assertion NON NULLE
 * sur une table `Partial<…>`. Retirer l'entrée `type` de cette table faisait **planter la page**
 * (`TypeError: labelFn is not a function`) — mesuré par ablation le 2026-08-21 — pendant que
 * `tsc --noEmit` sortait en 0. L'objectif du ticket parlait d'une « puce muette » : il n'y en
 * avait pas. Pour seize clés sur dix-sept, un libellé manquant rendait la valeur BRUTE
 * (`furnished: true` → puce « true ») ; pour la dix-septième, il cassait l'écran.
 */

export interface SearchToolbarProps {
  /**
   * TCK-335 — `null` quand la recherche a ÉCHOUÉ : le compteur n'affiche alors rien.
   *
   * Il valait `meta?.total ?? 0`, si bien qu'un 422 sur un filtre affichait
   * « 0 biens trouvés » — une réponse, là où il n'y avait pas de réponse. Accompagner
   * ce zéro d'un bandeau d'erreur ne suffit pas : l'écran porterait alors deux
   * affirmations contradictoires, et c'est le chiffre que l'œil lit en premier.
   */
  total: number | null;
  /** TCK-580 — une recherche court : du clic à l'arrivée des biens, pas seulement le `fetch`. */
  loading: boolean;
  filters: SearchFilters;
  /** TCK-580 — les filtres dont les résultats affichés sont la réponse ; cf. {@link PucesDeFiltres}. */
  filtresDesResultats?: SearchFilters;
  activeCount: number;
  onRemoveFilter: (key: keyof SearchFilters, subKey?: string) => void;
  onSortChange: (sort: SearchFilters['sort']) => void;
  onPerPageChange: (perPage: number) => void;
  onOpenSidebar: () => void;
  /**
   * TCK-552 — `false` quand le tri n'agit pas : vue carte (`/map` n'en déclare aucun) et liste à
   * zéro résultat. Le tri ET la taille de page sont alors masqués **sous `lg`** ; le bureau n'est
   * pas modifié (contrainte du ticket). Défaut : `true`.
   */
  afficherTri?: boolean;
  /**
   * TCK-552 — la bascule liste/carte de la rangée MOBILE, posée en bout de rangée et masquée à
   * partir de `lg` (le bureau garde ses onglets). Absente : rien n'est rendu à sa place.
   */
  basculeDeVue?: ReactNode;
  /**
   * TCK-552 — ce qui vient au BOUT des puces, dans la même rangée : l'action de sauvegarde. Rendu
   * seulement s'il y a au moins une puce — sauvegarder une recherche sans critère n'a pas de sens,
   * et c'est ce qui rendait le bouton désactivé « sans aucune explication » (P7).
   */
  finDesPuces?: ReactNode;
  /**
   * TCK-558 — `false` à zéro résultat CONFIRMÉ : les puces vivent alors dans l'état vide, où
   * chacune est l'issue proposée. Les rendre aussi ici afficherait deux fois la même rangée — et,
   * avec elle, deux fois la sauvegarde. Défaut : `true`.
   */
  afficherPuces?: boolean;
}

export function SearchToolbar({
  total,
  loading,
  filters,
  filtresDesResultats,
  activeCount,
  onRemoveFilter,
  onSortChange,
  onPerPageChange,
  onOpenSidebar,
  afficherTri = true,
  basculeDeVue,
  finDesPuces,
  afficherPuces = true,
}: SearchToolbarProps) {
  const t = useTranslations('search.toolbar');
  const tSort = useTranslations('search.sort');

  const perPageOptions = [30, 40, 60, 70].map((n) => ({
    value: String(n),
    label: t('perPageOption', { count: n }),
  }));
  const aUnPointGeo = filters.lat !== undefined && filters.lng !== undefined;
  const valeursDeTri = aUnPointGeo ? [...SORT_VALUES, TRI_DISTANCE] : [...SORT_VALUES];
  const sortOptions = valeursDeTri.map((v) => ({ value: v, label: tSort(v) }));

  return (
    <div className="mb-4 space-y-3 md:mb-6">
      {/* Top row : count + sort + mobile filter button */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 md:gap-4">
        <p className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
              {t('loading')}
            </span>
          ) : total === null ? null : (
            t('resultCount', { count: total })
          )}
        </p>

        {/*
          TCK-552 — UNE rangée d'outils sous `lg` : Filtres (principal), tri, bascule liste/carte.

          Elle valait trois rangées à 360 px — « 30 / page » et le tri, puis Filtres seul, puis les
          onglets Liste/Carte — et plaçait l'action principale du mobile en DERNIER, en style
          secondaire (P2, P3). L'ordre du document suit maintenant l'ordre d'usage ; à partir de
          `lg`, Filtres et la bascule sont masqués et il reste « par page » puis le tri, dans
          l'ordre et au gabarit d'avant : le bureau n'est pas modifié.

          ⚠ `flex-wrap` n'est PLUS posé sur ce groupe, et c'est délibéré. TCK-505 #8 l'y avait mis
          pour que 336 px de contrôles ne débordent pas de 328. Ici le débordement est tenu par le
          seul élément compressible — le tri, `min-w-0 flex-1`, dont la valeur se tronque. Avec
          `flex-wrap`, la bascule passerait à la ligne AVANT que le tri ne rétrécisse : le retour à
          la ligne se décide sur la largeur de CONTENU, pas sur la largeur minimale.
        */}
        <div className="flex w-full items-center gap-1.5 lg:w-auto lg:gap-3">
          {/* Filters button (mobile) — l'action principale sous `lg`. */}
          <button
            type="button"
            onClick={onOpenSidebar}
            className="lg:hidden flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,scale] hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.96]"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {t('filters')}
            {/* La pastille est DANS le bouton : posée en `absolute -top-1.5 -right-1.5`, elle en
                débordait (P3) et chevauchait le contrôle voisin dès que la rangée se resserrait. */}
            {activeCount > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-primary-foreground text-xs font-bold tabular-nums text-primary">
                {activeCount}
              </span>
            )}
          </button>

          {/* Per-page selector — bureau seulement (AC4). `per_page` reste lu dans l'URL et accepté
              par l'API : seul son CONTRÔLE disparaît sous `lg`, où il prenait la tête de la
              rangée pour un réglage que personne ne cherche sur un téléphone. */}
          <div data-controle="par-page" className="hidden lg:block">
            <Select
              value={String(filters.per_page ?? 30)}
              onValueChange={(v) => onPerPageChange(Number(v))}
              items={perPageOptions}
            >
              <SelectTrigger
                className="h-8 rounded-full py-1.5 px-3 border-border bg-card text-foreground cursor-pointer"
                aria-label={t('perPageAria')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {perPageOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sort selector */}
          <Select
            value={filters.sort ?? 'relevance'}
            onValueChange={(v) => onSortChange(v as SearchFilters['sort'])}
            items={sortOptions}
          >
            <SelectTrigger
              className={`h-11 min-w-0 flex-1 sm:max-w-60 lg:max-w-none rounded-full py-1.5 px-3 border-border bg-card text-foreground cursor-pointer lg:h-8 lg:w-fit lg:flex-none ${
                afficherTri ? '' : 'hidden lg:flex'
              }`}
              aria-label={t('sortAria')}
            >
              <SelectValue className="min-w-0 truncate" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {basculeDeVue ? (
            <div data-controle="bascule" className="ml-auto shrink-0 lg:hidden">
              {basculeDeVue}
            </div>
          ) : null}
        </div>
      </div>

      {/* Active filter tags — TCK-558 : à zéro résultat, c'est l'état vide qui les porte. */}
      {afficherPuces ? (
        <PucesDeFiltres
          filters={filters}
          filtresDesResultats={filtresDesResultats}
          onRemoveFilter={onRemoveFilter}
          fin={finDesPuces}
        />
      ) : null}
    </div>
  );
}

export interface PucesDeFiltresProps {
  readonly filters: SearchFilters;
  /**
   * TCK-580 — les filtres dont les résultats AFFICHÉS sont la réponse. `filters` porte ceux que
   * le dernier geste vise ; la différence entre les deux est ce qui attend, puce par puce. Absent :
   * rien n'attend.
   */
  readonly filtresDesResultats?: SearchFilters;
  readonly onRemoveFilter: (key: keyof SearchFilters, subKey?: string) => void;
  /** Ce qui vient au bout des puces, dans la même rangée — rendu seulement s'il y a une puce. */
  readonly fin?: ReactNode;
  /** Classes AJOUTÉES à la rangée (alignement, marges) — la rangée reste `flex flex-wrap`. */
  readonly className?: string;
  /** Nom du groupe, quand la rangée n'est pas déjà nommée par ce qui l'entoure. */
  readonly 'aria-label'?: string;
}

/**
 * Les puces des filtres actifs, chacune retirable — **un seul rendu** pour la barre d'outils et
 * pour l'état vide de la recherche (TCK-558).
 *
 * Les libellés viennent de {@link puceDeChaqueFiltreActif} (TCK-340), et le retrait passe par
 * `onRemoveFilter(cle, sousCle)` : une clé multi-valuée (`type`, `condition`) donne une puce par
 * valeur, et c'est à l'appelant de ne retirer que celle-là. L'état vide reçoit le MÊME
 * `onRemoveFilter` que la barre : un retrait n'a qu'un chemin.
 *
 * Il vit dans ce fichier plutôt que dans le sien : ses couples de contraste sont consignés par la
 * garde de la surface publique sous `components/search/SearchToolbar.tsx`, et le déplacer ne
 * changerait rien à l'écran pour tout changer à l'ardoise.
 */
type EtatDePuce = 'stable' | 'retrait' | 'ajout';

export function PucesDeFiltres({
  filters,
  filtresDesResultats,
  onRemoveFilter,
  fin,
  className = '',
  'aria-label': ariaLabel,
}: PucesDeFiltresProps) {
  const trads: TraducteursDeFiltre = {
    tags: useTranslations('search'),
    types: useTranslations('property.types'),
    contract: useTranslations('property.contractTypes'),
    periods: useTranslations('property.rentPeriods'),
    titleTypes: useTranslations('property.titleTypes'),
    conditions: useTranslations('property.conditions'),
  };
  /**
   * TCK-580 — la rangée est rendue depuis les DEUX jeux de filtres, et l'écart se voit.
   *
   * · une puce des résultats que le geste ne vise plus → `retrait` : elle RESTE, barrée, son ✕
   *   remplacé par le chargement, jusqu'à l'arrivée des biens. La faire disparaître au clic
   *   laissait l'œil sur un vide, sans savoir si le geste avait pris ;
   * · une puce visée qui n'a pas encore ses résultats → `ajout` : elle apparaît tout de suite,
   *   avec le chargement.
   *
   * L'identité d'une puce est sa clé ET son texte : `city=Dakar` → `city=Thiès` est un retrait
   * suivi d'un ajout, pas une puce « stable » qui changerait de libellé sous le doigt.
   */
  const texteDe = (source: SearchFilters, cle: string, libelle: string) =>
    cle === 'q' ? (source.q ?? '') : libelle;
  const identite = (p: { cle: string; sousCle?: string; texte: string }) =>
    `${p.cle}|${p.sousCle ?? ''}|${p.texte}`;
  const versPuces = (source: SearchFilters) =>
    puceDeChaqueFiltreActif(source, trads).map((p) => ({ ...p, texte: texteDe(source, p.cle, p.libelle) }));

  const visees = versPuces(filters);
  const affichees = filtresDesResultats ? versPuces(filtresDesResultats) : visees;
  const idVisees = new Set(visees.map(identite));
  const idAffichees = new Set(affichees.map(identite));
  const activeTags: (ReturnType<typeof versPuces>[number] & { etat: EtatDePuce })[] = [
    ...affichees.map((p) => ({ ...p, etat: (idVisees.has(identite(p)) ? 'stable' : 'retrait') as EtatDePuce })),
    ...visees.filter((p) => !idAffichees.has(identite(p))).map((p) => ({ ...p, etat: 'ajout' as EtatDePuce })),
  ];
  if (activeTags.length === 0) return null;

  return (
    <div
      data-rangee="puces"
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {activeTags.map(({ cle, sousCle, texte, etat }) => (
        <button
          key={`${cle}-${sousCle ?? ''}-${texte}`}
          type="button"
          data-etat-puce={etat}
          // Une puce en retrait n'a plus rien à retirer : le geste est déjà parti. `aria-disabled`
          // et non `disabled`, pour que le focus ne saute pas au clavier pendant l'attente.
          aria-disabled={etat === 'retrait' || undefined}
          aria-busy={etat !== 'stable' || undefined}
          onClick={() => {
            if (etat !== 'retrait') onRemoveFilter(cle, sousCle);
          }}
          className={`group flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-[background-color,border-color,color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            etat === 'retrait'
              ? 'cursor-progress border-border text-muted-foreground line-through decoration-1 opacity-70'
              : 'bg-primary/8 text-primary border-primary/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
          }`}
        >
          {/* TCK-552 — la recherche libre se signale par une ICÔNE, plus par des guillemets
              bruts (`"Dakar"`, P8). Le libellé de `q` dans `SEARCH_FILTER_KEYS` garde ses
              guillemets : il sert aussi le RÉSUMÉ d'une recherche sauvegardée
              (`SavedSearchesList`), une chaîne jointe par « · » où rien d'autre ne distingue
              le texte libre d'une ville. Ici, l'icône le fait. */}
          {cle === 'q' ? (
            <>
              <Search data-icone="recherche" className="size-3.5 shrink-0" aria-hidden />
              {texte}
            </>
          ) : (
            texte
          )}
          {/* TCK-580 — le ✕ et le chargement occupent la MÊME case : la puce ne change pas de
              largeur, et ses voisines ne bougent pas sous le doigt. */}
          {etat === 'stable' ? (
            <X className="size-3 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
          ) : (
            <Loader2 data-attente="puce-active" className="size-3 shrink-0 animate-spin" aria-hidden />
          )}
        </button>
      ))}
      {fin}
    </div>
  );
}
