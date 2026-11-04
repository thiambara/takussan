'use client';

import React, { useState, useRef, useId, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  BellPlus,
  Building2,
  CornerDownLeft,
  History,
  House,
  KeyRound,
  MapPin,
  Search,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useSuggest } from '@/hooks/useSuggest';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { useTraducteursDeFiltre } from '@/hooks/useTraducteursDeFiltre';
import { highlightMatch } from '@/lib/highlightMatch';
import { formatPrice } from '@/lib/utils';
import {
  effacerRecherchesRecentes,
  lireRecherchesRecentes,
  retenirRecherche,
  type RechercheRecente,
} from '@/lib/recherches-recentes';
import {
  filtresDeCriteres,
  filtresDeParametres,
  hrefDeListe,
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
import { parametreDe, puceDeChaqueFiltreActif } from '@/types/search';
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
  | { readonly genre: 'texte-libre' };

type Groupe = { readonly cle: string; readonly titre: string | null; readonly options: readonly Option[] };

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
 * - **compte nul** : la ligne comprise reste cliquable (« Voir des biens proches » : sous un résidu,
 *   la liste peut s'élargir, ADR-0024) et « Être alerté quand un bien correspond » ouvre l'alerte
 *   existante (TCK-599), pré-remplie des critères compris.
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
}: SearchAutocompleteProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const t = useTranslations('search.suggest');
  const tTypes = useTranslations('property.types');
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const trads = useTraducteursDeFiltre();
  const inputId = useId();
  const listboxId = useId();
  const enVigueur = value ?? '';
  const [query, setQuery] = useStateSyncedWith(enVigueur);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentes, setRecentes] = useState<RechercheRecente[]>([]);
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
  const { data, isFetching, pour } = useSuggest(query, { enabled: open, vide: true });
  const reponse = data?.data;

  // La compréhension ne se VALIDE (Entrée) que si elle répond à la saisie courante ; elle reste
  // AFFICHÉE pendant que la suivante arrive.
  const interpretation = !vide ? (reponse?.interpretation ?? null) : null;
  const compriseCourante = interpretation !== null && pour === saisie;

  // ─── Les groupes du panneau ──────────────────────────────────────────────────────────────────
  const groupes: Groupe[] = [];
  if (vide) {
    if (recentes.length > 0) {
      groupes.push({
        cle: 'recentes',
        titre: t('groups.recent'),
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
        titre: t('groups.popular'),
        options: populaires.map((recherche): Option => ({ genre: 'recherche', recherche })),
      });
    }
    groupes.push({
      cle: 'raccourcis',
      titre: t('groups.shortcuts'),
      options: [
        { genre: 'raccourci', contrat: 'rent' },
        { genre: 'raccourci', contrat: 'sale' },
      ],
    });
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
    const params = baseImposee(searchParams, imposer);
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

  function libelleDeSuggestion(item: SuggestItem): string {
    if (item.kind === 'property_type') {
      return tTypes.has(item.data.value) ? tTypes(item.data.value) : item.data.label;
    }
    return item.data.label;
  }

  function activer(option: Option) {
    const base = baseImposee(searchParams, imposer);
    switch (option.genre) {
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
    if (!open) {
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
      if (active) activer(active);
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
  const optionActiveRendue = open && activeIndex >= 0 && activeIndex < options.length;

  function contenu(option: Option, actif: boolean): React.ReactNode {
    switch (option.genre) {
      case 'comprise': {
        const { criteria, parts, residue, count } = option.interpretation;
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
            <span className={cn('shrink-0 text-xs tabular-nums', count > 0 ? 'text-muted-foreground' : 'font-medium')}>
              {count > 0 ? t('count', { count }) : t('nearby')}
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
      case 'recente':
        return (
          <>
            <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{option.recente.texte}</span>
          </>
        );
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
      case 'texte-libre':
        return (
          <>
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t('searchAll', { query: saisie })}</span>
          </>
        );
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/*
        TCK-731 (P07.06) — la pilule montre le focus de son champ, qui porte `outline-none` :
        mesuré au clavier, ni l'`input` ni ses parents ne changeaient de style. Anneau plein au
        jeton `ring` sur fond clair ; sur la barre sombre de la console (`bg-foreground`, où
        `ring` ne fait que 3,30:1), contour décalé à l'encre de la variante, `primary-foreground`,
        comme `ANNEAU_FOCUS` d'`AppTopbar` — mais par jeton : le blanc est refusé sous `/app`.
      */}
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
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={optionActiveRendue ? `${listboxId}-item-${activeIndex}` : undefined}
          type="text"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onQueryChange?.(v);
            if (!open) ouvrir();
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          // Un clic dans le champ qui a déjà le focus (après Échap, ou une suggestion choisie) le
          // rouvre : le focus, lui, ne se redéclenche pas.
          onClick={() => {
            if (!open) ouvrir();
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

      {open && (
        <div
          ref={listeRef}
          id={listboxId}
          role="listbox"
          aria-label={t('placeholder')}
          className="absolute left-0 top-full z-50 mt-2 max-h-[min(70dvh,34rem)] w-full min-w-[320px] overflow-y-auto overscroll-contain rounded-xl bg-card py-1.5 shadow-lg ring-1 ring-border sm:min-w-[400px]"
        >
          {groupes.map((groupe, rangDuGroupe) => {
            const titreId = `${listboxId}-${groupe.cle}`;
            return (
              <div
                key={groupe.cle}
                role="group"
                aria-labelledby={groupe.titre ? titreId : undefined}
                aria-label={groupe.titre ? undefined : t('groups.understood')}
              >
                {groupe.titre ? (
                  <div
                    id={titreId}
                    role="presentation"
                    className="px-4 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {groupe.titre}
                  </div>
                ) : null}
                {groupe.options.map((option, i) => {
                  const idx = debuts[rangDuGroupe] + i;
                  const actif = activeIndex === idx;
                  return (
                    <div
                      key={`${groupe.cle}-${idx}`}
                      id={`${listboxId}-item-${idx}`}
                      data-rang={idx}
                      role="option"
                      // Focalisable par programme seulement, jamais par Tab : le focus reste au champ.
                      tabIndex={-1}
                      aria-selected={actif}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors',
                        actif ? 'bg-primary/8 text-primary' : 'text-foreground hover:bg-muted/50',
                      )}
                      onMouseEnter={() => setActiveIndex(idx)}
                      // Le focus reste dans le champ (motif combobox : les options ne le prennent jamais,
                      // `aria-activedescendant` les désigne) ; le clavier continue de piloter la liste.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        activer(option);
                      }}
                    >
                      {contenu(option, actif)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* L'annonce du nombre de suggestions, une fois la réponse arrivée — jamais pendant la frappe. */}
      {open ? (
        <div role="status" aria-live="polite" className="sr-only">
          {isFetching ? '' : t('announce', { count: options.length })}
        </div>
      ) : null}

      {alerte ? (
        <SaveSearchDialog
          open
          onOpenChange={(ouvert) => {
            if (!ouvert) {
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
