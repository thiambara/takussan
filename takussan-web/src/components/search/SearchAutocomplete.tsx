'use client';

import React, { useState, useRef, useId, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  ArrowRight,
  BellPlus,
  Building2,
  CornerDownLeft,
  History,
  House,
  KeyRound,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { normaliserSaisie, useSuggest } from '@/hooks/useSuggest';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { useTraducteursDeFiltre } from '@/hooks/useTraducteursDeFiltre';
import { highlightMatch } from '@/lib/highlightMatch';
import { formatPrice } from '@/lib/utils';
import {
  effacerRecherchesRecentes,
  lireRecherchesRecentes,
  lireVuesDesRecherches,
  retenirRecherche,
  type RechercheRecente,
} from '@/lib/recherches-recentes';
import {
  QUARTIERS_POPULAIRES_MAX,
  requeteDeFacette,
  useFacette,
  useNouveauxDepuis,
  useVilleDesQuartiers,
} from '@/components/search/donnees-de-l-ecran-de-recherche';
import {
  filtresDeCriteres,
  filtresDeLaBase,
  filtresDeParametres,
  hrefDeListe,
  laListeSElargira,
  parametresVersLaListe,
} from '@/lib/suggestions-de-recherche';
import { filtersToCriteria } from '@/components/favorites/SaveSearchButton';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import type {
  ContractType,
  SearchFilters,
  SuggestCity,
  SuggestInterpretation,
  SuggestNeighborhood,
  SuggestPreview,
  SuggestPropertyType,
  SuggestRecherche,
  SuggestResponse,
  TraducteursDeFiltre,
} from '@/types/search';
import { cn } from '@/lib/utils';
import { CLES_DE_RECHERCHE, definitionDe, parametreDe, puceDeChaqueFiltreActif } from '@/types/search';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';

// TCK-1037 — le dialogue de l'alerte tire zod et react-hook-form : chargé au premier geste, jamais
// dans le JS initial des pages publiques, qui portent toutes cette barre (`zod-hors-des-pages-publiques`).
const SaveSearchDialog = dynamic(() =>
  import('@/components/favorites/SaveSearchDialog').then((m) => m.SaveSearchDialog),
);

export type SuggestItem =
  | { kind: 'city'; data: SuggestCity }
  | { kind: 'neighborhood'; data: SuggestNeighborhood }
  | { kind: 'property_type'; data: SuggestPropertyType };

/**
 * L'URL d'une SUGGESTION CHOISIE — le seul endroit du front qui ait le droit d'écrire `city`
 * depuis la barre de recherche (TCK-439).
 *
 * C'est la distinction qui fait tenir le champ : ce qui sort d'ici vient d'une liste que le
 * serveur a proposée, donc `city` / `location` / `type` sont des identités connues. Ce que
 * l'utilisateur tape et n'a choisi nulle part reste du texte, et part en `q` — dans la navbar
 * (`buildSearchUrl`) comme sur la touche Entrée ci-dessous.
 *
 * TCK-911 (P01.09) — exportée pour l'état vide de la liste (`SearchEmpty`), qui propose les mêmes
 * suggestions : une suggestion y mène où elle mène depuis la barre.
 */
export function urlDeSuggestion(item: SuggestItem, base: URLSearchParams, locale: Locale): string {
  const params = new URLSearchParams(base.toString());
  if (item.kind === 'city') {
    params.set(parametreDe('city'), item.data.label);
    // switching city invalidates any previous neighborhood
    params.delete(parametreDe('location'));
    // TCK-635 — et la région d'une ville homonyme choisie avant : elle départagerait la nouvelle à 0.
    params.delete(parametreDe('region'));
  } else if (item.kind === 'neighborhood') {
    params.set(parametreDe('city'), item.data.city);
    params.delete(parametreDe('region'));
    params.set(parametreDe('location'), item.data.label);
  } else {
    params.set(parametreDe('type'), item.data.value);
  }
  params.delete(parametreDe('page'));
  return hrefLocalise(`/properties?${params.toString()}`, locale);
}

/**
 * TCK-2475 — les lieux de la réponse (`places`, TCK-2474) en suggestions de la barre, puis les types
 * (`property_types`). Les anciennes clés `cities` et `neighborhoods` ne sont plus lues : `places`
 * les remplace (fautes tolérées, quartiers regroupés). Un quartier sans ville n'a pas d'URL sûre.
 */
export function lieuxEtTypes(reponse: SuggestResponse['data'] | undefined): SuggestItem[] {
  const lieux: SuggestItem[] = [];
  for (const place of reponse?.places ?? []) {
    if (place.kind === 'city') lieux.push({ kind: 'city', data: { label: place.label, count: place.count } });
    else if (place.city) {
      lieux.push({ kind: 'neighborhood', data: { label: place.label, city: place.city, count: place.count } });
    }
  }
  const types = (reponse?.property_types ?? []).map((d): SuggestItem => ({ kind: 'property_type', data: d }));
  return [...lieux, ...types];
}

/** Les paramètres de l'URL courante, sur lesquels l'appelant pose les siens (`''` = retirer). */
function baseImposee(courants: URLSearchParams, imposer?: Readonly<Record<string, string>>): URLSearchParams {
  const params = new URLSearchParams(courants.toString());
  for (const [cle, valeur] of Object.entries(imposer ?? {})) {
    if (valeur === '') params.delete(cle);
    else params.set(cle, valeur);
  }
  return params;
}

/**
 * Les libellés d'une saisie comprise, dans l'ordre où elle a été TAPÉE (`parts[].from`) — « appart
 * 3ch almadies » se lit « Appartement · 3+ ch. · Quartier : Almadies » — puis ce qu'elle implique
 * (la ville d'un quartier), puis le texte restant. Les libellés sont ceux des puces de filtre.
 */
function libellesCompris(
  criteria: SuggestInterpretation['criteria'],
  parts: SuggestInterpretation['parts'],
  residue: string | null,
  trads: TraducteursDeFiltre,
): string[] {
  const position = new Map(parts.map((p) => [p.key, p.from]));
  return puceDeChaqueFiltreActif(filtresDeCriteres(criteria, residue), trads)
    .map((puce, rang) => ({
      puce,
      rang,
      ordre: puce.cle === 'q' ? Number.MAX_SAFE_INTEGER : (position.get(puce.cle) ?? 1e9),
    }))
    .sort((a, b) => a.ordre - b.ordre || a.rang - b.rang)
    .map(({ puce }) => puce.libelle);
}

/** Le repli de casse et d'accents sous lequel une faute se distingue d'une simple capitale. */
function replie(texte: string): string {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
}

/**
 * TCK-2496 — les lieux que la saisie a COMPRIS malgré une faute : la part garde les positions du mot
 * TAPÉ (`from`/`to`, dans la saisie telle que le serveur l'a lue), et sa valeur est l'orthographe de
 * l'index. « appart 3ch mermos » → `[{ tape: 'mermos', lu: 'Mermoz' }]`. Une capitale ou un accent de
 * différence n'est pas une correction. Exportée pour le test.
 */
export function lieuxCorriges(
  parts: SuggestInterpretation['parts'],
  saisieLue: string,
): { readonly tape: string; readonly lu: string }[] {
  const corriges: { tape: string; lu: string }[] = [];
  for (const part of parts) {
    if ((part.key !== 'location' && part.key !== 'city') || typeof part.value !== 'string') continue;
    const tape = saisieLue.slice(part.from, part.to);
    if (tape && replie(tape) !== replie(part.value)) corriges.push({ tape, lu: part.value });
  }
  return corriges;
}

/** La clé de la table qui POSSÈDE un paramètre d'URL (`bedrooms` → `bedrooms`, `search` → `q`). */
function cleDuParametre(parametre: string): (typeof CLES_DE_RECHERCHE)[number] | undefined {
  return CLES_DE_RECHERCHE.find((cle) => definitionDe(cle).params.includes(parametre));
}

/** Les critères compris, sans celui dont la sonde de `relaxations` a mesuré le retrait. */
function criteresSans(criteria: SuggestInterpretation['criteria'], cle: string): SuggestInterpretation['criteria'] {
  const reste: Record<string, unknown> = { ...criteria };
  delete reste[cle];
  return reste as SuggestInterpretation['criteria'];
}

function HighlightedText({ label, query }: { label: string; query: string }) {
  const { before, match, after } = highlightMatch(label, query);
  if (!match) return <span className="min-w-0 truncate">{label}</span>;
  return (
    <span className="min-w-0 truncate">
      {before}
      <mark className="bg-primary/10 text-[var(--primary-deep)] font-semibold not-italic rounded-sm px-px">{match}</mark>
      {after}
    </span>
  );
}

/** Une ligne du panneau. Chaque genre dit ce qu'il fait quand on le choisit — cf. `activer`. */
type Option =
  | { readonly genre: 'comprise'; readonly interpretation: SuggestInterpretation }
  | { readonly genre: 'alerte'; readonly interpretation: SuggestInterpretation }
  | { readonly genre: 'recherche'; readonly recherche: SuggestRecherche }
  | { readonly genre: 'recente'; readonly recente: RechercheRecente }
  | { readonly genre: 'effacer' }
  | { readonly genre: 'raccourci'; readonly contrat: ContractType }
  | { readonly genre: 'suggestion'; readonly item: SuggestItem }
  | { readonly genre: 'apercu'; readonly bien: SuggestPreview }
  | { readonly genre: 'texte-libre' }
  // TCK-2497 — l'écran « Riche et complet » (surfaces `ecran` et `panneau`).
  | { readonly genre: 'autour' }
  | { readonly genre: 'relaxation'; readonly interpretation: SuggestInterpretation; readonly cle: string; readonly compte: number }
  | { readonly genre: 'retirer-filtres'; readonly libelles: readonly string[] };

type Groupe = {
  readonly cle: string;
  readonly titre: string | null;
  readonly options: readonly Option[];
  /** `pastilles` : des options posées en ligne (quartiers, types, critères à retirer). */
  readonly forme?: 'lignes' | 'pastilles';
  /** Panneau de bureau, champ vide : la colonne où le groupe se range (l'ordre du clavier suit). */
  readonly colonne?: 1 | 2;
};

/** Ce que l'écran sait dire de la dernière demande de position (« Autour de moi »). */
type EtatPosition = 'repos' | 'attente' | 'refuse' | 'indisponible' | 'echec';

/** Le rayon d'« Autour de moi » depuis l'écran de recherche : la promesse de la maquette, 2 km. */
export const RAYON_AUTOUR_DE_MOI_KM = 2;

/** Plafonds d'affichage : le panneau propose, il ne remplace pas la liste. */
const MAX_COMPLETIONS = 4;
const MAX_LIEUX = 4;
const MAX_TYPES = 3;
const MAX_APERCUS = 3;

export interface SearchAutocompleteProps {
  placeholder?: string;
  variant?: 'hero' | 'navbar';
  className?: string;
  onQueryChange?: (query: string) => void;
  /**
   * La recherche EN VIGUEUR — le `q` de l'URL sur la liste des biens. Le champ s'y resynchronise
   * (rechargement, retour arrière, terme retiré par le repli) et reste modifiable entre-temps.
   */
  value?: string;
  /**
   * Le champ s'apprête à naviguer — Entrée, ligne « Rechercher … », ou suggestion choisie. Une
   * fois par navigation, jamais sur une frappe. La saisie mobile de la navbar s'en sert pour se
   * refermer au geste, sans attendre la page suivante (TCK-549).
   */
  onValider?: () => void;
  /** L'icône d'entrée du champ — la loupe par défaut ; l'épingle de lieu dans la barre publique. */
  icone?: LucideIcon;
  /**
   * Des paramètres que l'appelant impose à TOUTE URL produite ici — Entrée comme suggestion
   * choisie. `''` retire le paramètre. La barre publique y passe son choix « Acheter | Louer » :
   * sans quoi Entrée partait sans lui, et seul le bouton loupe l'appliquait.
   */
  imposer?: Readonly<Record<string, string>>;
  /**
   * TCK-2497 — où la barre se pose :
   *
   * - `menu` (défaut) : la liste déroulante d'avant, inchangée — la barre de `/app` (`AppTopbar`) ;
   * - `ecran` : l'écran plein écran du téléphone (la saisie de la `Navbar`). La liste n'est plus
   *   POSÉE sur la page mais rangée SOUS le champ et sous `sousLeChamp` : elle ne recouvre jamais
   *   Louer / Acheter ni le bouton principal (défaut relevé le 2026-11-08). Toujours ouverte ;
   * - `panneau` : le panneau du champ de l'en-tête au bureau — même contenu, en deux colonnes avant
   *   la frappe, avec les aides clavier.
   *
   * Hors de `menu` s'ajoutent : « Autour de moi », les quartiers populaires et les types (champ vide),
   * « N nouveaux » sur une récente, et la ligne « Vos filtres restent ».
   */
  surface?: 'menu' | 'ecran' | 'panneau';
  /** `ecran` seulement : ce qui se pose sous le champ, au-dessus de la liste (Louer / Acheter). */
  sousLeChamp?: React.ReactNode;
  /**
   * TCK-2497 — « Vos filtres restent … Retirer » a été choisi : les filtres de l'URL ne font plus partie
   * de la base. L'appelant qui construit ses propres URL (la loupe de la `Navbar`) s'y aligne.
   */
  onRetraitDesFiltres?: () => void;
}

/**
 * La barre de recherche — UNE seule, posée par la navbar publique (bureau et saisie mobile, donc
 * l'accueil) et par la barre de l'app (`AppTopbar`).
 *
 * TCK-2475 — elle suggère au fil de la frappe, sur `GET /api/search/suggest` (TCK-2474) :
 *
 * - **champ vide** : les recherches récentes de l'appareil (effaçables), les recherches populaires
 *   (`popular`), deux raccourcis Louer / Acheter ;
 * - **pendant la frappe** : la saisie COMPRISE en tête, en libellés de filtre, avec son nombre de
 *   biens — c'est ce que valide Entrée —, puis les recherches fréquentes, les lieux et types, et
 *   trois biens en aperçu qui ouvrent leur fiche ;
 * - **compte nul** : la ligne comprise reste cliquable — « Voir des biens proches » seulement si la
 *   liste s'élargira (résidu d'au moins deux mots, ADR-0024), « 0 bien » sinon — et « Être alerté
 *   quand un bien correspond » ouvre l'alerte existante (TCK-599), pré-remplie des critères compris.
 *
 * Le compte annoncé est celui de la liste ouverte : la saisie part au serveur avec les filtres de la
 * base (URL courante, `imposer`), que le serveur fusionne comme `parametresVersLaListe`.
 *
 * Rien ne clignote : la réponse précédente reste affichée pendant le chargement, et Entrée ne
 * valide une compréhension que si elle répond à la saisie COURANTE (`pour`, `useSuggest`) — sinon
 * Entrée cherche le texte tel quel. Aucune recherche n'est journalisée d'ici : le serveur journalise
 * la recherche validée (page 1 de la liste, ADR-0088).
 */
export function SearchAutocomplete({
  placeholder,
  variant = 'hero',
  className,
  onQueryChange,
  icone: Icone = Search,
  imposer,
  value,
  onValider,
  surface = 'menu',
  sousLeChamp,
  onRetraitDesFiltres,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const t = useTranslations('search.suggest');
  const tEcran = useTranslations('search.ecran');
  const tTypes = useTranslations('property.types');
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const trads = useTraducteursDeFiltre();
  const inputId = useId();
  const listboxId = useId();
  const enVigueur = value ?? '';
  const [query, setQuery] = useStateSyncedWith(enVigueur);
  const riche = surface !== 'menu';
  const ecran = surface === 'ecran';
  const [open, setOpen] = useState(false);
  // L'écran du téléphone EST le panneau : il ne se referme qu'avec lui (la `Sheet` de la `Navbar`).
  const ouvert = ecran || open;
  const [activeIndex, setActiveIndex] = useState(-1);
  // L'écran est monté à l'ouverture de la saisie : ses récentes se lisent tout de suite, sans focus.
  const [recentes, setRecentes] = useState<RechercheRecente[]>(() => (ecran ? lireRecherchesRecentes() : []));
  const [vues, setVues] = useState<Readonly<Record<string, string>>>(() => (ecran ? lireVuesDesRecherches() : {}));
  const [etatPosition, setEtatPosition] = useState<EtatPosition>('repos');
  // « Retirer » les filtres gardés : retenu POUR l'URL où il a été choisi — une navigation l'oublie.
  const [retraitSur, setRetraitSur] = useState<string | null>(null);
  const baseSansFiltres = retraitSur !== null && retraitSur === searchParams.toString();
  const courants = baseSansFiltres ? new URLSearchParams() : searchParams;
  const [alerte, setAlerte] = useState<{ filtres: SearchFilters; ouverture: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  // Le dialogue de l'alerte rend le focus au champ en se fermant : ce focus-là ne rouvre pas le
  // panneau. Un instant, pas un drapeau : un dialogue qui ne rendrait pas le focus ne doit pas
  // faire ignorer le prochain focus du visiteur.
  const fermetureDeLAlerte = useRef(0);

  const saisie = query.trim();
  const vide = saisie === '';

  // Liste fermée, rien à suggérer : un champ prérempli par l'URL n'interroge pas le serveur à
  // chaque chargement de la liste des biens. Ouvert sur un champ vide : les recherches populaires.
  // Revue adverse du 2026-11-04 (défaut n° 5) — la base de la navigation (URL courante + `imposer`) part avec la saisie :
  // le compte annoncé est celui de la liste qu'ouvrira `activer`, qui part de la même base.
  const { data, isFetching, pour } = useSuggest(query, {
    enabled: ouvert,
    vide: true,
    base: filtresDeLaBase(baseImposee(courants, imposer)),
  });
  const reponse = data?.data;

  // La compréhension ne se VALIDE (Entrée) que si elle répond à la saisie courante ; elle reste
  // AFFICHÉE pendant que la suivante arrive.
  const interpretation = !vide ? (reponse?.interpretation ?? null) : null;
  const compriseCourante = interpretation !== null && pour === normaliserSaisie(saisie);

  // ─── TCK-2497 — ce que l'écran riche lit en plus ───────────────────────────────────────────────
  const base = baseImposee(courants, imposer);
  const avantLaFrappe = riche && ouvert && vide;
  const villeDeLaBase = base.get(parametreDe('city'))?.trim() || null;
  const villeDesQuartiers = useVilleDesQuartiers(avantLaFrappe, villeDeLaBase);
  // Revue de TCK-2497 — le compte d'une pastille est celui de la liste qu'elle OUVRE : la requête part de
  // l'URL même du geste (`urlDeSuggestion`, sur la même base), sa valeur seule retirée.
  const qsDuGeste = (item: SuggestItem) => urlDeSuggestion(item, base, locale).split('?')[1] ?? '';
  const quartiersComptes = useFacette(
    avantLaFrappe && villeDesQuartiers !== null,
    villeDesQuartiers
      ? requeteDeFacette(qsDuGeste({ kind: 'neighborhood', data: { label: '', city: villeDesQuartiers, count: 0 } }), 'neighborhood')
      : null,
    'neighborhood',
  );
  const typesComptes = useFacette(
    avantLaFrappe,
    requeteDeFacette(qsDuGeste({ kind: 'property_type', data: { label: '', value: '', count: 0 } }), 'type'),
    'type',
  ) ?? [];
  const quartiersPopulaires =
    villeDesQuartiers && quartiersComptes
      ? { ville: villeDesQuartiers, quartiers: quartiersComptes.slice(0, QUARTIERS_POPULAIRES_MAX) }
      : null;
  const nouveaux = useNouveauxDepuis(avantLaFrappe, recentes, vues);

  // « Vos filtres restent » : les filtres de la base que la liste gardera ET que la saisie ne remplace
  // pas — ni la transaction (Louer / Acheter les montre déjà), ni le terme (la saisie le remplace).
  const libellesDeLaSaisie = new Set(
    interpretation ? libellesCompris(interpretation.criteria, interpretation.parts, interpretation.residue, trads) : [],
  );
  const filtresGardes = riche
    ? puceDeChaqueFiltreActif(
        filtresDeParametres(
          interpretation
            ? parametresVersLaListe(interpretation.criteria, null, filtresDeLaBase(base))
            : filtresDeLaBase(base),
        ),
        trads,
      )
        .filter((puce) => puce.cle !== 'contract_type' && puce.cle !== 'q' && !libellesDeLaSaisie.has(puce.libelle))
        .map((puce) => puce.libelle)
    : [];

  // ─── Les groupes du panneau ──────────────────────────────────────────────────────────────────
  const groupes: Groupe[] = [];
  if (filtresGardes.length > 0) {
    groupes.push({
      cle: 'filtres-gardes',
      titre: null,
      colonne: 1,
      options: [{ genre: 'retirer-filtres', libelles: filtresGardes }],
    });
  }
  if (vide && riche) {
    groupes.push({ cle: 'autour', titre: null, colonne: 1, options: [{ genre: 'autour' }] });
  }
  if (vide) {
    if (recentes.length > 0) {
      groupes.push({
        cle: 'recentes',
        titre: riche ? tEcran('recent') : t('groups.recent'),
        colonne: 1,
        options: [
          ...recentes.map((recente): Option => ({ genre: 'recente', recente })),
          { genre: 'effacer' },
        ],
      });
    }
    const populaires = reponse?.popular ?? [];
    if (populaires.length > 0) {
      groupes.push({
        cle: 'populaires',
        titre: riche ? tEcran('popular') : t('groups.popular'),
        colonne: 2,
        options: populaires.map((recherche): Option => ({ genre: 'recherche', recherche })),
      });
    }
    // Sur l'écran du téléphone, Louer / Acheter et « Rechercher » sont posés sous le champ : les
    // raccourcis les répéteraient.
    if (!ecran) {
      groupes.push({
        cle: 'raccourcis',
        titre: t('groups.shortcuts'),
        colonne: 1,
        options: [
          { genre: 'raccourci', contrat: 'rent' },
          { genre: 'raccourci', contrat: 'sale' },
        ],
      });
    }
    if (riche && quartiersPopulaires) {
      groupes.push({
        cle: 'quartiers',
        titre: tEcran('neighbourhoods', { city: quartiersPopulaires.ville }),
        forme: 'pastilles',
        colonne: 2,
        options: quartiersPopulaires.quartiers.map(
          (q): Option => ({
            genre: 'suggestion',
            item: { kind: 'neighborhood', data: { label: q.valeur, city: quartiersPopulaires.ville, count: q.compte } },
          }),
        ),
      });
    }
    if (riche && typesComptes.length > 0) {
      groupes.push({
        cle: 'types-de-bien',
        titre: tEcran('types'),
        forme: 'pastilles',
        colonne: 2,
        options: typesComptes.map(
          (type): Option => ({
            genre: 'suggestion',
            item: { kind: 'property_type', data: { label: type.valeur, value: type.valeur, count: type.compte } },
          }),
        ),
      });
    }
  } else {
    if (interpretation) {
      groupes.push({
        cle: 'comprise',
        titre: null,
        options: [
          { genre: 'comprise', interpretation },
          ...(interpretation.count === 0 ? [{ genre: 'alerte', interpretation } as Option] : []),
        ],
      });
      // TCK-2496 — sous un compte nul, les critères dont le retrait rend des biens, avec leur compte.
      // Clé absente (API antérieure) ou vide : aucun groupe, jamais un bloc vide.
      const relaxations = interpretation.count === 0 ? (interpretation.relaxations ?? []) : [];
      if (relaxations.length > 0) {
        groupes.push({
          cle: 'relaxations',
          titre: t('groups.relaxations'),
          forme: 'pastilles',
          options: relaxations.map(
            (r): Option => ({ genre: 'relaxation', interpretation, cle: r.key, compte: r.count }),
          ),
        });
      }
    }
    const completions = (reponse?.completions ?? []).slice(0, MAX_COMPLETIONS);
    if (completions.length > 0) {
      groupes.push({
        cle: 'completions',
        titre: t('groups.completions'),
        options: completions.map((recherche): Option => ({ genre: 'recherche', recherche })),
      });
    }
    const items = lieuxEtTypes(reponse);
    const lieux = items.filter((i) => i.kind !== 'property_type').slice(0, MAX_LIEUX);
    // Un type déjà compris n'est pas reproposé seul.
    const typeCompris = interpretation !== null && 'type' in (interpretation.criteria ?? {});
    const types = typeCompris ? [] : items.filter((i) => i.kind === 'property_type').slice(0, MAX_TYPES);
    if (lieux.length > 0) {
      groupes.push({
        cle: 'lieux',
        titre: t('groups.places'),
        options: lieux.map((item): Option => ({ genre: 'suggestion', item })),
      });
    }
    if (types.length > 0) {
      groupes.push({
        cle: 'types',
        titre: t('groups.property_types'),
        options: types.map((item): Option => ({ genre: 'suggestion', item })),
      });
    }
    const apercus = (reponse?.previews ?? []).slice(0, MAX_APERCUS);
    if (apercus.length > 0) {
      groupes.push({
        cle: 'apercus',
        titre: t('groups.previews'),
        options: apercus.map((bien): Option => ({ genre: 'apercu', bien })),
      });
    }
    // TCK-507 — sans compréhension, la recherche du texte tel quel reste offerte en clair : c'est
    // ce que fait Entrée, et le panneau ne dit jamais « Aucun résultat » (il n'a pas cherché).
    if (!interpretation) {
      groupes.push({ cle: 'texte-libre', titre: null, options: [{ genre: 'texte-libre' }] });
    }
  }
  // Panneau de bureau, champ vide : deux colonnes. L'ordre des options (celui du clavier) suit celui de
  // l'écran : la première colonne entière, puis la seconde.
  const enColonnes = surface === 'panneau' && vide;
  if (enColonnes) groupes.sort((a, b) => (a.colonne ?? 1) - (b.colonne ?? 1));
  const options = groupes.flatMap((g) => g.options);
  // Le rang de la première option de chaque groupe : les `id` d'option suivent l'ordre du clavier.
  const debuts = groupes.map((_, i) => groupes.slice(0, i).reduce((n, g) => n + g.options.length, 0));

  // Une nouvelle réponse redistribue les lignes : la ligne active ne glisse pas sous le curseur.
  const [optionsVues, setOptionsVues] = useState(data);
  if (optionsVues !== data) {
    setOptionsVues(data);
    setActiveIndex(-1);
  }

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listeRef.current?.querySelector<HTMLElement>(`[data-rang="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function ouvrir() {
    setRecentes(lireRecherchesRecentes());
    setVues(lireVuesDesRecherches());
    setOpen(true);
  }

  /** Navigue vers la liste, et retient la recherche dans les récentes de l'appareil. */
  function allerALaListe(params: URLSearchParams, texte: string) {
    setOpen(false);
    retenirRecherche({ texte, qs: params.toString() });
    onValider?.();
    router.push(hrefDeListe(params, locale));
  }

  /**
   * La recherche plein-texte sur la saisie telle quelle — ce que fait Entrée sans compréhension
   * courante ni suggestion active, et ce que propose la ligne « Rechercher « … » » (TCK-507).
   */
  function rechercherTexteLibre() {
    const params = baseImposee(courants, imposer);
    // Un champ vidé RETIRE `q` : c'est dans ce champ, et nulle part ailleurs, qu'on l'efface.
    if (saisie) params.set(parametreDe('q'), saisie);
    else params.delete(parametreDe('q'));
    params.delete(parametreDe('page'));
    allerALaListe(params, saisie);
  }

  function libelleDeRecherche(r: SuggestRecherche): string {
    if (r.text.trim()) return r.text;
    return libellesCompris(r.criteria, [], null, trads).join(' · ');
  }

  /** « Sans Piscine, Vue sur mer » — le libellé des puces de ce critère, ou le texte resté incompris. */
  function libelleDeRelaxation(interpretation: SuggestInterpretation, cle: string): string {
    if (cle === 'q') return t('relaxationText', { text: interpretation.residue ?? '' });
    const nom = cleDuParametre(cle);
    const valeur = interpretation.criteria[cle];
    const libelles =
      nom && valeur !== undefined
        ? libellesCompris({ [cle]: valeur }, [], null, trads)
        : [];
    return t('relaxation', { criteria: libelles.length > 0 ? libelles.join(', ') : cle });
  }

  /**
   * « Autour de moi » — la position n'est demandée QU'AU GESTE, jamais au chargement (contrainte du
   * ticket). Le refus est une réponse, rendue à l'écran ; la recherche reste ouverte.
   */
  function autourDeMoi() {
    const source = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!source) {
      setEtatPosition('indisponible');
      return;
    }
    setEtatPosition('attente');
    const depart = baseImposee(courants, imposer);
    source.getCurrentPosition(
      (position) => {
        setEtatPosition('repos');
        // Un point remplace le lieu : une ville ou un quartier d'avant s'ajouteraient en ET au rayon.
        for (const cle of ['q', 'location', 'city', 'region', 'cities'] as const) {
          for (const p of definitionDe(cle).params) depart.delete(p);
        }
        depart.delete(parametreDe('page'));
        depart.set('lat', String(position.coords.latitude));
        depart.set('lng', String(position.coords.longitude));
        depart.set('radius_km', String(RAYON_AUTOUR_DE_MOI_KM));
        setOpen(false);
        onValider?.();
        router.push(hrefDeListe(depart, locale));
      },
      (erreur: GeolocationPositionError) => setEtatPosition(erreur?.code === 1 ? 'refuse' : 'echec'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function libelleDeSuggestion(item: SuggestItem): string {
    if (item.kind === 'property_type') {
      return tTypes.has(item.data.value) ? tTypes(item.data.value) : item.data.label;
    }
    return item.data.label;
  }

  function activer(option: Option) {
    const base = baseImposee(courants, imposer);
    switch (option.genre) {
      case 'autour':
        autourDeMoi();
        return;
      case 'relaxation': {
        const { criteria, residue } = option.interpretation;
        const params =
          option.cle === 'q'
            ? parametresVersLaListe(criteria, null, base)
            : parametresVersLaListe(criteresSans(criteria, option.cle), residue, base);
        allerALaListe(params, saisie);
        return;
      }
      case 'retirer-filtres':
        setRetraitSur(searchParams.toString());
        setActiveIndex(-1);
        onRetraitDesFiltres?.();
        return;
      case 'comprise': {
        const { criteria, residue } = option.interpretation;
        allerALaListe(parametresVersLaListe(criteria, residue, base), saisie);
        return;
      }
      case 'alerte': {
        const { criteria, residue } = option.interpretation;
        setOpen(false);
        setAlerte((a) => ({
          filtres: filtresDeParametres(parametresVersLaListe(criteria, residue, base)),
          ouverture: (a?.ouverture ?? 0) + 1,
        }));
        return;
      }
      case 'recherche':
        allerALaListe(
          parametresVersLaListe(option.recherche.criteria, option.recherche.text, base),
          libelleDeRecherche(option.recherche),
        );
        return;
      case 'recente':
        allerALaListe(new URLSearchParams(option.recente.qs), option.recente.texte);
        return;
      case 'effacer':
        effacerRecherchesRecentes();
        setRecentes([]);
        setActiveIndex(-1);
        return;
      case 'raccourci': {
        for (const p of ['q', 'search', 'page']) base.delete(p);
        base.set(parametreDe('contract_type'), option.contrat);
        setOpen(false);
        onValider?.();
        router.push(hrefDeListe(base, locale));
        return;
      }
      case 'suggestion': {
        setOpen(false);
        // `urlDeSuggestion` conserve `q` : le champ revient donc à la recherche en vigueur, pas à
        // vide — sans quoi il cesserait de montrer un terme qui filtre toujours la liste.
        setQuery(enVigueur);
        onQueryChange?.(enVigueur);
        onValider?.();
        const href = urlDeSuggestion(option.item, base, locale);
        retenirRecherche({ texte: libelleDeSuggestion(option.item), qs: href.split('?')[1] ?? '' });
        router.push(href);
        return;
      }
      case 'apercu':
        setOpen(false);
        onValider?.();
        router.push(hrefLocalise(`/properties/${option.bien.slug}`, locale));
        return;
      case 'texte-libre':
        rechercherTexteLibre();
        return;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!ouvert) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        ouvrir();
      } else if (e.key === 'Enter' && query.trim() !== enVigueur.trim()) {
        // Liste fermée — champ vidé, ou saisie reprise après Échap : Entrée soumet ce qui
        // DIFFÈRE de la recherche en vigueur. Vider le champ puis Entrée retire donc `q`.
        e.preventDefault();
        rechercherTexteLibre();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1 >= options.length ? -1 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= -1 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = activeIndex >= 0 ? options[activeIndex] : undefined;
      // Une ligne « comprise » ou « alerte » encore AFFICHÉE d'une saisie précédente (`keepPreviousData`) ne se
      // valide pas au clavier : ses critères ne sont pas ceux de la saisie courante.
      const comprisePerimee = (active?.genre === 'comprise' || active?.genre === 'alerte') && !compriseCourante;
      if (active && !comprisePerimee) activer(active);
      else if (compriseCourante && interpretation) activer({ genre: 'comprise', interpretation });
      // Entrée SANS suggestion active ni compréhension courante = texte libre, donc `q` — la même
      // clé que le bouton loupe et que la puce de catégorie.
      else rechercherTexteLibre();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'Tab') {
      // Le focus quitte le champ : le panneau ne reste pas ouvert derrière lui.
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const defaultPlaceholder = t('placeholder');
  const nom = placeholder ?? defaultPlaceholder;

  const isNavbar = variant === 'navbar';

  // TCK-731 (P31.01) — une référence ARIA ne vise que ce qui est rendu : la liste n'est montée
  // qu'ouverte, et l'option active seulement si elle existe dans le rendu courant.
  const optionActiveRendue = ouvert && activeIndex >= 0 && activeIndex < options.length;
  const corriges = compriseCourante && interpretation && pour ? lieuxCorriges(interpretation.parts, pour) : [];

  function contenu(option: Option, actif: boolean): React.ReactNode {
    switch (option.genre) {
      case 'comprise': {
        const { criteria, parts, residue, count } = option.interpretation;
        const elargira = count === 0 && laListeSElargira(option.interpretation);
        const note = corriges.length > 0
          ? corriges.map((c) => t('readAs', { typed: c.tape, read: c.lu })).join(' · ')
          : null;
        if (ecran) {
          // L'écran du téléphone : la saisie comprise devient le geste principal, « Voir les N biens ».
          return (
            <span className="flex w-full flex-col gap-2">
              <span className="flex items-start gap-2.5">
                <Search aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-primary" />
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {libellesCompris(criteria, parts, residue, trads).map((libelle) => (
                    <span key={libelle} className="inline-flex h-7 items-center rounded-full bg-secondary px-2.5 text-[0.8125rem] font-medium text-primary-deep">
                      {libelle}
                    </span>
                  ))}
                </span>
              </span>
              {note ? <span className="pl-[26px] text-[0.8125rem] text-muted-foreground">{note}</span> : null}
              {count > 0 ? (
                <span className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[0.9375rem] font-semibold tabular-nums text-primary-foreground">
                  {t('seeCount', { count })}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </span>
              ) : (
                <>
                  <span className="text-[0.9375rem] font-semibold text-foreground">{tEcran('noneTitle')}</span>
                  <span className="flex h-11 items-center justify-center rounded-xl border border-border text-[0.9375rem] font-medium tabular-nums">
                    {elargira ? t('nearby') : t('count', { count })}
                  </span>
                </>
              )}
            </span>
          );
        }
        return (
          <>
            <Search aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {libellesCompris(criteria, parts, residue, trads).map((libelle) => (
                <span key={libelle} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {libelle}
                </span>
              ))}
            </span>
            {note ? <span className="shrink-0 text-xs text-muted-foreground">{note}</span> : null}
            <span className={cn('shrink-0 text-xs tabular-nums', count > 0 ? 'text-muted-foreground' : 'font-medium')}>
              {/* Défaut n° 9 — « biens proches » seulement si la liste s'élargira (ADR-0024) ; sinon le compte dit 0. */}
              {elargira ? t('nearby') : t('count', { count })}
            </span>
            {compriseCourante && activeIndex === -1 ? (
              <kbd className="hidden shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 font-sans text-xs text-muted-foreground sm:inline-flex">
                <CornerDownLeft aria-hidden="true" className="size-3" />
                {t('enterHint')}
              </kbd>
            ) : null}
          </>
        );
      }
      case 'alerte':
        if (ecran) {
          return (
            <span className="flex w-full flex-col gap-2">
              <span className="text-[0.8125rem] text-muted-foreground">{tEcran('alertHint')}</span>
              <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[0.9375rem] font-semibold text-primary-foreground">
                <BellPlus aria-hidden="true" className="size-4" />
                {tEcran('alert')}
              </span>
            </span>
          );
        }
        return (
          <>
            <BellPlus aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 font-medium">{t('alert')}</span>
          </>
        );
      case 'recherche':
        return (
          <>
            <TrendingUp aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1">
              <HighlightedText label={libelleDeRecherche(option.recherche)} query={saisie} />
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t('count', { count: option.recherche.count })}
            </span>
          </>
        );
      case 'recente': {
        const arrives = riche ? nouveaux.get(option.recente.qs) : undefined;
        return (
          <>
            <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{option.recente.texte}</span>
              {arrives !== undefined && arrives > 0 ? (
                <span className="truncate text-xs text-primary-deep">{tEcran('newSince', { count: arrives })}</span>
              ) : null}
            </span>
          </>
        );
      }
      case 'effacer':
        return (
          <>
            <X aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn('min-w-0 flex-1 truncate text-xs', !actif && 'text-muted-foreground')}>{t('clearRecent')}</span>
          </>
        );
      case 'raccourci': {
        const IconeRaccourci = option.contrat === 'rent' ? KeyRound : House;
        return (
          <>
            <IconeRaccourci aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {option.contrat === 'rent' ? t('shortcutRent') : t('shortcutSale')}
            </span>
          </>
        );
      }
      case 'suggestion': {
        const { item } = option;
        const IconeSuggestion = item.kind === 'property_type' ? Building2 : MapPin;
        return (
          <>
            <IconeSuggestion aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <HighlightedText label={libelleDeSuggestion(item)} query={saisie} />
              {item.kind === 'neighborhood' ? (
                <span className="truncate text-xs text-muted-foreground">{item.data.city}</span>
              ) : null}
            </span>
            <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">{item.data.count}</span>
          </>
        );
      }
      case 'apercu': {
        const { bien } = option;
        const lieu = [bien.neighborhood, bien.city].filter(Boolean).join(', ');
        return (
          <>
            <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              <PropertyPhoto src={bien.photo_url} alt="" compact sizes="48px" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{bien.title}</span>
              <span className="flex min-w-0 gap-1 text-xs">
                {bien.price !== null ? (
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatPrice(bien.price, 'XOF')}
                    {bien.contract_type === 'rent' && bien.rent_period ? `/${tPeriodes(bien.rent_period)}` : ''}
                  </span>
                ) : null}
                {lieu ? <span className="min-w-0 truncate text-muted-foreground">{bien.price !== null ? `· ${lieu}` : lieu}</span> : null}
              </span>
            </span>
          </>
        );
      }
      case 'autour': {
        const detail =
          etatPosition === 'attente' ? tEcran('aroundMe.locating')
          : etatPosition === 'refuse' ? tEcran('aroundMe.denied')
          : etatPosition === 'indisponible' ? tEcran('aroundMe.unavailable')
          : etatPosition === 'echec' ? tEcran('aroundMe.failed')
          : tEcran('aroundMe.detail', { km: RAYON_AUTOUR_DE_MOI_KM });
        return (
          <>
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              {etatPosition === 'attente' ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
              ) : (
                <LocateFixed aria-hidden="true" className="size-5 text-primary" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{tEcran('aroundMe.title')}</span>
              <span className="text-xs text-muted-foreground">{detail}</span>
            </span>
          </>
        );
      }
      case 'relaxation':
        return (
          <>
            <span className="min-w-0 truncate">{libelleDeRelaxation(option.interpretation, option.cle)}</span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{option.compte}</span>
          </>
        );
      case 'retirer-filtres':
        return (
          <>
            <SlidersHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
              <span className="font-medium">{tEcran('keptFilters')}</span> {option.libelles.join(', ')}
            </span>
            <span className="shrink-0 text-[0.8125rem] font-medium text-foreground underline underline-offset-4">{tEcran('removeFilters')}</span>
          </>
        );
      case 'texte-libre':
        return (
          <>
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t('searchAll', { query: saisie })}</span>
          </>
        );
    }
  }

  /** Une option, rendue en ligne ou en pastille selon son groupe. */
  function rendreOption(option: Option, idx: number, forme: Groupe['forme']) {
    const actif = activeIndex === idx;
    const pastille = forme === 'pastilles';
    const carte = ecran && (option.genre === 'comprise' || option.genre === 'alerte');
    return (
      <div
        key={idx}
        id={`${listboxId}-item-${idx}`}
        data-rang={idx}
        role="option"
        // Focalisable par programme seulement, jamais par Tab : le focus reste au champ.
        tabIndex={-1}
        aria-selected={actif}
        className={cn(
          'cursor-pointer transition-colors',
          pastille
            ? cn(
                'inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3.5 text-sm font-medium',
                actif
                  ? 'border-primary bg-secondary text-primary-deep dark:bg-primary/8'
                  : 'border-border bg-card text-foreground hover:bg-muted dark:hover:bg-muted/50',
              )
            : carte
              ? cn('mx-4 flex rounded-2xl border bg-card p-3.5', option.genre === 'alerte' ? 'mt-2 border-border' : 'border-primary/30 shadow-[0_6px_18px_-12px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)]', actif && 'ring-2 ring-ring')
              : cn(
                  'flex min-h-11 items-center gap-3 px-4 py-2 text-sm',
                  option.genre === 'retirer-filtres' && 'mx-4 my-1 rounded-xl bg-muted px-3.5',
                  // En clair, des aplats OPAQUES : les options sont rendues par une fonction, hors de
                  // l'arbre qui porte le fond de la liste, et un fond translucide y serait jugé sur un
                  // sous-jacent inconnu (`couples-de-contraste.ts`, règle 4). `text-primary` ne tient que
                  // 4,45:1 sur `--secondary` : l'encre active est `primary-deep`. En sombre, les teintes
                  // translucides d'avant : `--secondary` et `--muted` y valent #3a2e23, où le surlignage
                  // du `<mark>` tombe à 4,44:1 (`pastille-et-surlignage.contraste.test.ts`).
                  actif ? 'bg-secondary text-primary-deep dark:bg-primary/8' : 'text-foreground hover:bg-muted dark:hover:bg-muted/50',
                ),
        )}
        onMouseEnter={() => setActiveIndex(idx)}
        // Le focus reste dans le champ (motif combobox : les options ne le prennent jamais,
        // `aria-activedescendant` les désigne) ; le clavier continue de piloter la liste.
        onMouseDown={(e) => {
          e.preventDefault();
          activer(option);
        }}
      >
        {pastille && option.genre === 'suggestion' ? (
          <>
            <span className="min-w-0 truncate">{libelleDeSuggestion(option.item)}</span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{option.item.data.count}</span>
          </>
        ) : (
          contenu(option, actif)
        )}
      </div>
    );
  }

  function rendreGroupe(groupe: Groupe, rangDuGroupe: number) {
    const titreId = `${listboxId}-${groupe.cle}`;
    const pastilles = groupe.forme === 'pastilles';
    return (
      <div
        key={groupe.cle}
        role="group"
        aria-labelledby={groupe.titre ? titreId : undefined}
        aria-label={groupe.titre ? undefined : groupe.cle === 'comprise' ? t('groups.understood') : groupe.cle === 'filtres-gardes' ? tEcran('keptFilters') : groupe.cle === 'autour' ? tEcran('aroundMe.title') : t('groups.understood')}
      >
        {groupe.titre ? (
          <div
            id={titreId}
            role="presentation"
            className={
              riche
                ? 'px-4 pb-1.5 pt-4 text-[0.8125rem] font-semibold text-muted-foreground'
                : 'px-4 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground'
            }
          >
            {groupe.titre}
          </div>
        ) : null}
        {pastilles ? (
          <div className="flex flex-wrap gap-2 px-4 pb-1">
            {groupe.options.map((option, i) => rendreOption(option, debuts[rangDuGroupe] + i, groupe.forme))}
          </div>
        ) : (
          groupe.options.map((option, i) => rendreOption(option, debuts[rangDuGroupe] + i, groupe.forme))
        )}
      </div>
    );
  }

  /** Les groupes, en deux colonnes au panneau de bureau avant la frappe (l'ordre du clavier suit). */
  function rendreGroupes() {
    if (!enColonnes) return groupes.map(rendreGroupe);
    const colonne = (n: 1 | 2) =>
      groupes.map((g, i) => ((g.colonne ?? 1) === n ? rendreGroupe(g, i) : null));
    return (
      <div className="grid grid-cols-2 gap-x-4">
        <div className="min-w-0">{colonne(1)}</div>
        <div className="min-w-0">{colonne(2)}</div>
      </div>
    );
  }

  const listbox = (
    <div
      ref={listeRef}
      id={listboxId}
      role="listbox"
      aria-label={t('placeholder')}
      className={
        ecran
          ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(var(--spacing)*6,env(safe-area-inset-bottom))] pt-1'
          : surface === 'panneau'
            ? 'max-h-[min(70dvh,var(--spacing)*144)] overflow-y-auto overscroll-contain py-2'
            : 'absolute left-0 top-full z-50 mt-2 max-h-[min(70dvh,var(--spacing)*136)] w-full min-w-[320px] overflow-y-auto overscroll-contain rounded-xl bg-card py-1.5 shadow-lg ring-1 ring-border sm:min-w-[400px]'
      }
    >
      {rendreGroupes()}
    </div>
  );

  // TCK-731 (P07.06) — la pilule montre le focus de son champ, qui porte `outline-none` :
  // mesuré au clavier, ni l'`input` ni ses parents ne changeaient de style. Anneau plein au
  // jeton `ring` sur fond clair ; sur la barre sombre de la console (`bg-foreground`, où
  // `ring` ne fait que 3,30:1), contour décalé à l'encre de la variante, `primary-foreground`,
  // comme `ANNEAU_FOCUS` d'`AppTopbar` — mais par jeton : le blanc est refusé sous `/app`.
  const champ = (
      <div
        className={cn(
          'flex items-center gap-2',
          isNavbar
            ? 'h-9 min-w-72 rounded-full bg-card/10 px-4 text-primary-foreground/80 hover:bg-card/20 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-foreground'
            : 'rounded-full border border-border bg-card px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-ring',
        )}
      >
        <Icone aria-hidden="true" className={cn('shrink-0', isNavbar ? 'size-4 text-primary-foreground/60' : 'size-4 text-primary')} />
        {/* Motif combobox ARIA 1.2 : le rôle est sur l'`input`, nommé par le texte qu'il affiche. */}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={nom}
          aria-expanded={ouvert}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={ouvert ? listboxId : undefined}
          aria-activedescendant={optionActiveRendue ? `${listboxId}-item-${activeIndex}` : undefined}
          type="text"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onQueryChange?.(v);
            if (!ouvert) ouvrir();
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          // Un clic dans le champ qui a déjà le focus (après Échap, ou une suggestion choisie) le
          // rouvre : le focus, lui, ne se redéclenche pas.
          onClick={() => {
            if (!ouvert) ouvrir();
          }}
          onFocus={() => {
            if (Date.now() - fermetureDeLAlerte.current < 1000) return;
            ouvrir();
          }}
          placeholder={nom}
          className={cn(
            'w-full bg-transparent text-sm outline-none',
            isNavbar ? 'text-primary-foreground placeholder:text-primary-foreground/50' : 'text-foreground placeholder:text-muted-foreground font-medium',
          )}
          autoComplete="off"
        />
      </div>
  );

  return (
    <div ref={containerRef} className={cn('relative', ecran && 'flex min-h-0 flex-col', className)}>
      {ecran ? (
        <div className="shrink-0 space-y-3 px-4 pb-3">
          {champ}
          {sousLeChamp}
        </div>
      ) : (
        // Hors de l'écran, la pilule reste le PREMIER enfant du conteneur : la barre de bureau
        // l'aplatit par `[&>div:first-child]` (TCK-731).
        champ
      )}

      {ouvert && surface === 'panneau' ? (
        // Le panneau de bureau : la liste, puis les aides clavier — hors de la liste, qui ne contient
        // que des options.
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(var(--spacing)*176,calc(100vw-var(--spacing)*8))] overflow-hidden rounded-2xl bg-card shadow-[0_24px_48px_-24px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] ring-1 ring-border">
          {listbox}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-background px-1.5 font-sans">↑</kbd>
            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-background px-1.5 font-sans">↓</kbd>
            {tEcran('keys.choose')}
            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-background px-1.5 font-sans">
              <CornerDownLeft aria-hidden="true" className="size-3" />
            </kbd>
            {tEcran('keys.open')}
            <kbd className="inline-flex h-6 items-center justify-center rounded border border-border bg-background px-1.5 font-sans">{tEcran('keys.escape')}</kbd>
            {tEcran('keys.close')}
          </p>
        </div>
      ) : ouvert ? (
        listbox
      ) : null}

      {/* L'annonce du nombre de suggestions, une fois la réponse arrivée — jamais pendant la frappe. */}
      {ouvert ? (
        <div role="status" aria-live="polite" className="sr-only">
          {isFetching ? '' : t('announce', { count: options.length })}
        </div>
      ) : null}

      {alerte ? (
        <SaveSearchDialog
          open
          onOpenChange={(ouvertDuDialogue) => {
            if (!ouvertDuDialogue) {
              fermetureDeLAlerte.current = Date.now();
              setAlerte(null);
            }
          }}
          filters={alerte.filtres}
          criteria={filtersToCriteria(alerte.filtres)}
          ouverture={alerte.ouverture}
          alerteCochee
        />
      ) : null}
    </div>
  );
}
