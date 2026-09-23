'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { X, RotateCcw, Search, Star, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDebouncedCallback } from '@/hooks/useDebouncedValue';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { AutourDeMoi } from '@/components/search/AutourDeMoi';
import { conditionValues, titleTypeValues } from '@/lib/schemas/property';
import { filtersToParams } from '@/hooks/useSearch';
import { CLES_DE_RECHERCHE, type SearchFilters } from '@/types/search';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-5 border-b border-border last:border-0">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isActive = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? undefined : opt.value)}
            className={`min-h-9 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors duration-150 active:scale-[0.96] ${
              isActive
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bornes numériques — **commit au `blur` et à `Enter`, jamais sur un timer** (TCK-335).
 *
 * Un anti-rebond court ne suffit PAS ici, et c'est mesuré : frapper « 150000 » avec une simple
 * temporisation laisse toute pause de saisie déclencher `price_min=15`, qui rend **le catalogue
 * entier** — 29 374 octets et une hydratation Eloquent complète, six fois de suite pour un seul
 * prix (176 Ko). Les valeurs intermédiaires d'un champ libre (`city=Dak`) rendent 0 résultat et
 * 126 octets ; celles d'une borne numérique rendent tout. Les deux familles ne peuvent donc pas
 * partager la même règle.
 *
 * Pas de bouton « Appliquer » : la Direction UX de TCK-335 interdit de redessiner ce panneau, et
 * aucune clé i18n n'existe pour un tel libellé.
 */
function RangeInputs({
  placeholderMin,
  placeholderMax,
  valueMin,
  valueMax,
  hint,
  onChangeMin,
  onChangeMax,
  onCommit,
}: {
  placeholderMin: string;
  placeholderMax: string;
  valueMin: string;
  valueMax: string;
  hint?: string;
  onChangeMin: (v: string) => void;
  onChangeMax: (v: string) => void;
  onCommit: () => void;
}) {
  const surTouche = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/*
          `min={0}` — TCK-335. Les règles du serveur sont `numeric|min:0` : une valeur
          négative rend 422, donc « 0 bien trouvé ». Le défaut existait déjà sur le prix
          (`?price_min=-5` → 422) et l'ajout des bornes de surface le doublait. Le champ
          refuse désormais le signe moins avant qu'il n'atteigne l'URL.
        */}
        <Input
          type="number"
          min={0}
          placeholder={placeholderMin}
          value={valueMin}
          onChange={(e) => onChangeMin(e.target.value)}
          onBlur={onCommit}
          onKeyDown={surTouche}
          className="rounded-xl"
        />
        <span className="shrink-0 text-muted-foreground text-sm">–</span>
        <Input
          type="number"
          min={0}
          placeholder={placeholderMax}
          value={valueMax}
          onChange={(e) => onChangeMax(e.target.value)}
          onBlur={onCommit}
          onKeyDown={surTouche}
          className="rounded-xl"
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const CONTRACT_TYPE_VALUES = ['sale', 'rent'] as const;

const PROPERTY_TYPE_VALUES = [
  'apartment', 'house', 'villa', 'studio', 'room', 'land', 'office', 'shop',
  'warehouse', 'hotel', 'resort', 'garage', 'parking', 'farm', 'factory', 'other',
] as const;

const RENT_PERIOD_VALUES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
// TCK-491 — la source des quatre valeurs est le schéma du parcours de publication : une
// cinquième liste écrite ici divergerait le jour où l'enum backend bougerait.


const BEDROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
];

const BATHROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3+', value: 3 },
];

const FLOOR_KEYS = ['ground', 'first', 'second', 'third', 'fourthPlus'] as const;

/** Délai d'anti-rebond des champs LIBRES, en millisecondes. */
const DEBOUNCE_CHAMPS_LIBRES_MS = 400;

/** `''` → `undefined` : un filtre vide n'est pas un filtre, il ne doit pas partir dans l'URL. */
function texteVersFiltre(v: string): string | undefined {
  return v === '' ? undefined : v;
}

function nombreVersFiltre(v: string): number | undefined {
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function filtreVersTexte(v: number | undefined): string {
  return v === undefined ? '' : String(v);
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface FilterSidebarProps {
  filters: SearchFilters;
  /**
   * TCK-335, étape 5 — `continu: true` signale un commit dont la valeur a transité par des
   * états intermédiaires (les quatre champs texte, les quatre bornes numériques). L'appelant
   * l'inscrit alors dans l'historique par `replace` : sans quoi un mot de cinq lettres coûte
   * cinq appuis sur Précédent pour être défait. Un geste discret — puce, bascule, date —
   * n'a pas d'états intermédiaires et empile.
   *
   * TCK-556 — **tiroir mobile ouvert, TOUT commit est `continu`**, geste discret compris. La
   * séance du tiroir est elle-même un geste continu : ses états transitent jusqu'à la fermeture,
   * et c'est la séance entière, pas chaque puce, que le retour arrière doit pouvoir défaire.
   * Tiroir fermé, la taxonomie ci-dessus est inchangée. Voir {@link TiroirMobile}.
   */
  onFilterChange: (patch: Partial<SearchFilters>, options?: { continu?: boolean }) => void;
  onReset: () => void;
  activeCount: number;
  open: boolean;
  onClose: () => void;
  /**
   * TCK-556 — le total de la recherche COURANTE (`meta.total`), que le tiroir cache à 90 % de la
   * hauteur. Il est porté par le bouton de pied (« Voir 48 biens »). `null` ou absent quand il
   * n'est pas connu — chargement, erreur : le bouton dit alors « Voir les résultats », plutôt
   * qu'un compte périmé présenté comme celui des filtres affichés.
   */
  total?: number | null;
  /**
   * Délai d'anti-rebond des champs libres. Injectable pour que les tests le réduisent à
   * quelques millisecondes sans figer les timers (patron `WizardReprenable`) — jamais pour
   * l'ajuster en production.
   */
  debounceMs?: number;
  /** Passé tel quel à {@link AutourDeMoi} — injectable pour les tests, jamais en production. */
  geolocalisation?: Pick<Geolocation, 'getCurrentPosition'>;
}

/**
 * Panneau de filtres publics.
 *
 * ## L'anti-rebond est ICI, et les deux autres emplacements sont interdits (TCK-335, étape 3)
 *
 * Chaque champ de saisie tient un **brouillon local**, resynchronisé sur `filters` par
 * `useStateSyncedWith` (TCK-316). Seul le *commit* vers `onFilterChange` est temporisé.
 *
 * Ce n'est pas une optimisation, c'est **un correctif de saisie**. Avant, l'input était contrôlé
 * par `filters`, qui vient de l'URL. `router.replace` de l'App Router est une transition : l'URL
 * n'atterrit qu'après l'aller-retour RSC. Entre-temps, `restoreStateOfTarget` du react-dom du
 * dépôt (19.2.8) rappelle `updateInput` avec les props du dernier commit et **réécrit
 * `element.value` à l'ancienne valeur** — le caractère frappé DISPARAÎT de l'écran, puis revient
 * ~150 ms plus tard.
 *
 * Les deux emplacements écartés, et pourquoi :
 *
 * - **temporiser le fetch dans `useSearch`** : les 5 aller-retours RSC subsistent (c'est
 *   `router.replace` qui les provoque, pas le fetch), et la saisie clignote toujours ;
 * - **temporiser `router.replace`** : c'est exactement le scénario ci-dessus — l'input reste
 *   contrôlé par une URL qui ne bouge pas, donc le caractère frappé disparaît.
 */
export function FilterSidebar({
  filters,
  onFilterChange,
  onReset,
  activeCount,
  open,
  onClose,
  total = null,
  debounceMs = DEBOUNCE_CHAMPS_LIBRES_MS,
  geolocalisation,
}: FilterSidebarProps) {
  const t = useTranslations('search.filters');
  const tTypes = useTranslations('property.types');
  const tContract = useTranslations('property.contractTypes');
  const tPeriods = useTranslations('property.rentPeriods');
  const tTitleTypes = useTranslations('property.titleTypes');
  const tConditions = useTranslations('property.conditions');

  // ── Brouillons : la valeur AFFICHÉE est locale et immédiate ; `filters` ne fait que la
  //    resynchroniser quand l'URL change réellement (retour arrière, « Tout effacer », puce
  //    retirée depuis la barre d'outils).
  const [cityDraft, setCityDraft] = useStateSyncedWith(filters.city ?? '');
  const [locationDraft, setLocationDraft] = useStateSyncedWith(filters.location ?? '');
  const [tagsDraft, setTagsDraft] = useStateSyncedWith(filters.tags ?? '');
  const [priceMinDraft, setPriceMinDraft] = useStateSyncedWith(filtreVersTexte(filters.price_min));
  const [priceMaxDraft, setPriceMaxDraft] = useStateSyncedWith(filtreVersTexte(filters.price_max));
  const [areaMinDraft, setAreaMinDraft] = useStateSyncedWith(filtreVersTexte(filters.area_min));
  const [areaMaxDraft, setAreaMaxDraft] = useStateSyncedWith(filtreVersTexte(filters.area_max));

  // ── Ce que la saisie en cours n'a pas encore envoyé. Recalculé à CHAQUE rendu : c'est ce qui
  //    garantit qu'aucun commit ne parte avec une version périmée.
  const brouillonEnAttente: Partial<SearchFilters> = {};
  if (texteVersFiltre(cityDraft) !== filters.city) {
    brouillonEnAttente.city = texteVersFiltre(cityDraft);
  }
  if (texteVersFiltre(locationDraft) !== filters.location) {
    brouillonEnAttente.location = texteVersFiltre(locationDraft);
  }
  if (texteVersFiltre(tagsDraft) !== filters.tags) {
    brouillonEnAttente.tags = texteVersFiltre(tagsDraft);
  }
  if (nombreVersFiltre(priceMinDraft) !== filters.price_min) {
    brouillonEnAttente.price_min = nombreVersFiltre(priceMinDraft);
  }
  if (nombreVersFiltre(priceMaxDraft) !== filters.price_max) {
    brouillonEnAttente.price_max = nombreVersFiltre(priceMaxDraft);
  }
  if (nombreVersFiltre(areaMinDraft) !== filters.area_min) {
    brouillonEnAttente.area_min = nombreVersFiltre(areaMinDraft);
  }
  if (nombreVersFiltre(areaMaxDraft) !== filters.area_max) {
    brouillonEnAttente.area_max = nombreVersFiltre(areaMaxDraft);
  }
  const aUnBrouillon = Object.keys(brouillonEnAttente).length > 0;

  /**
   * TCK-556 — la séance du tiroir mobile : la recherche à son ouverture, et l'état visé par son
   * dernier commit (`null` = aucun commit depuis l'ouverture). C'est ce qu'il faut pour que le
   * retour arrière ferme le tiroir SANS défaire ses filtres — cf. {@link TiroirMobile}.
   */
  const seanceDuTiroir = React.useRef<{ depart: string; vise: SearchFilters | null }>({
    depart: '',
    vise: null,
  });

  /** Le commit tel que l'appelant le fusionnera, noté si le tiroir est ouvert. */
  const commettre = (patch: Partial<SearchFilters>, continu: boolean) => {
    if (open) {
      seanceDuTiroir.current.vise = { ...filters, ...patch };
      onFilterChange(patch, { continu: true });
      return;
    }
    if (continu) onFilterChange(patch, { continu: true });
    else onFilterChange(patch);
  };

  const commitBrouillon = () => {
    if (!aUnBrouillon) return;
    commettre({ ...brouillonEnAttente, page: 1 }, true);
  };

  // `useDebouncedCallback` relit `commitBrouillon` au DÉCLENCHEMENT, jamais à l'armement : un
  // `contract_type` posé entre la frappe et l'échéance n'est donc pas effacé.
  const differe = useDebouncedCallback(commitBrouillon, debounceMs);

  /**
   * Commit d'un geste DISCRET (puce, bascule, date, retrait).
   *
   * ⚠️ Le brouillon en attente est fusionné dans le patch. Sans cela, cliquer une puce pendant
   * que l'utilisateur tape EFFACE le texte en cours : `onFilterChange` ne recevrait que la puce,
   * `filters` repartirait sans la ville, et `useStateSyncedWith` ramènerait l'input à vide. Le
   * timer est annulé dans la foulée — ce commit-ci porte déjà le brouillon.
   */
  const set = (patch: Partial<SearchFilters>) => {
    differe.cancel();
    commettre({ ...brouillonEnAttente, ...patch, page: 1 }, false);
  };

  /** Champ LIBRE : on affiche tout de suite, on commite plus tard. */
  const surSaisieLibre =
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      differe.call();
    };

  /**
   * `blur` / `Enter` d'un champ libre : on ne fait pas attendre l'utilisateur qui a fini.
   *
   * Ce `flush` n'est pas cosmétique : `SaveSearchButton` vit HORS de ce panneau et lit `filters`,
   * c'est-à-dire l'URL. Sans lui, l'utilisateur qui tape puis clique « Enregistrer la recherche »
   * enregistre la recherche d'AVANT sa frappe.
   */
  const surFinSaisieLibre = () => differe.flush();

  const surToucheLibre = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      differe.flush();
    }
  };

  /**
   * Commit SÉANCE TENANTE de tout ce qui est en attente.
   *
   * `flush()` ne suffit pas ici : il ne déclenche que ce qu'un timer avait armé, et les bornes
   * numériques n'en arment jamais (cf. {@link RangeInputs}). C'est donc cette fonction que
   * portent leur `blur`, leur `Enter`, et le bouton « Voir les résultats » du tiroir mobile.
   */
  const commitImmediat = () => {
    differe.cancel();
    commitBrouillon();
  };

  /**
   * « Tout effacer ». Tiroir fermé : `onReset`, qui EMPILE (TCK-335). Tiroir ouvert (TCK-556) :
   * c'est un geste de la séance comme un autre, donc il passe par {@link commettre} — sans quoi il
   * s'empilerait au-dessus de la sentinelle, et le retour arrière ré-inscrirait l'état d'AVANT
   * l'effacement : le geste retour défaisait « Tout effacer » au lieu de seulement fermer.
   * Le patch porte chaque clé à `undefined`, contrôles compris, comme `resetFilters`.
   */
  const reinitialiser = () => {
    differe.cancel();
    if (!open) {
      onReset();
      return;
    }
    const toutEfface = Object.fromEntries(
      CLES_DE_RECHERCHE.map((cle) => [cle, undefined]),
    ) as Partial<SearchFilters>;
    commettre({ ...toutEfface, page: 1 }, true);
  };

  const contractTypes = CONTRACT_TYPE_VALUES.map((v) => ({ label: tContract(v), value: v }));
  const rentPeriods = RENT_PERIOD_VALUES.map((v) => ({ label: tPeriods(v), value: v }));
  const floorOptions = FLOOR_KEYS.map((k, i) => ({ label: t(`floors.${k}`), value: i }));
  const titleTypeOptions = titleTypeValues.map((v) => ({ label: tTitleTypes(v), value: v }));

  // Le rappel suit le BROUILLON, pas l'URL : il doit décrire ce que l'utilisateur voit dans le
  // champ, y compris avant que la borne ne soit validée.
  const priceHint = (() => {
    const parts: string[] = [];
    const min = nombreVersFiltre(priceMinDraft);
    const max = nombreVersFiltre(priceMaxDraft);
    if (min !== undefined) parts.push(`≥ ${min.toLocaleString('fr-SN')} FCFA`);
    if (max !== undefined) parts.push(`≤ ${max.toLocaleString('fr-SN')} FCFA`);
    return parts.join(' · ');
  })();

  /**
   * TCK-556 — la séance du tiroir, vue depuis l'historique.
   *
   * - à l'ouverture, on note la recherche de départ ;
   * - au retour arrière tiroir ouvert, le navigateur est déjà revenu sur l'entrée d'AVANT le
   *   tiroir. On ferme ; et si la séance a écrit quelque chose, on **revient en avant** sur
   *   l'entrée de la séance (la sentinelle, qui porte son URL et l'arbre du routeur). Aucune
   *   navigation, aucun aller-retour RSC : le routeur restaure deux fois depuis son cache. Un
   *   brouillon encore en attente d'anti-rebond est commité une fois l'avance atterrie — sur
   *   l'entrée de la séance, jamais sur celle d'avant ;
   * - à toute autre fermeture, l'entrée du tiroir n'est gardée que si la séance a écrit quelque
   *   chose (ou s'apprête à le faire : un brouillon dont l'anti-rebond court encore).
   *
   * ⚠ La première version ré-inscrivait la séance par un `push` après avoir laissé le routeur
   * restaurer l'entrée d'avant : mesuré au navigateur, la liste RECHARGEAIT et affichait l'état
   * d'avant le tiroir pendant 270 à 510 ms, le temps de l'aller-retour RSC du `push`.
   *
   * ⚠ On ne peut PAS empêcher le routeur de voir ce retour : son écouteur `popstate`, inscrit au
   * montage de l'application, passe avant celui du tiroir. Mesuré dans Chrome 154 : sur `window`,
   * un écouteur de CAPTURE inscrit après un écouteur de bulle passe APRÈS lui — l'ordre est celui
   * d'inscription, et `stopImmediatePropagation()` y arrive trop tard. (jsdom, lui, passe la
   * capture d'abord : un test qui s'appuierait sur ce détail serait vert sur un mécanisme mort.)
   * Reste, mesuré : la liste relance sa recherche au retour (« Chargement… » ~300 à 700 ms sous
   * `next dev`) et réaffiche LES MÊMES résultats — jamais ceux d'avant le tiroir.
   */
  const surOuvertureDuTiroir = () => {
    seanceDuTiroir.current = { depart: filtersToParams(filters).toString(), vise: null };
  };

  const surRetourDansLeTiroir = () => {
    differe.cancel();
    const brouillon = brouillonEnAttente;
    const aEcrit = seanceDuTiroir.current.vise !== null || Object.keys(brouillon).length > 0;
    onClose();
    if (!aEcrit) return;
    const surAvance = () => {
      window.removeEventListener('popstate', surAvance);
      if (Object.keys(brouillon).length > 0) onFilterChange({ ...brouillon, page: 1 }, { continu: true });
    };
    window.addEventListener('popstate', surAvance);
    window.history.forward();
  };

  const seanceAEcrit = () => seanceDuTiroir.current.vise !== null || aUnBrouillon;

  // TCK-556 · F3 — la recherche libre est rappelée en tête du tiroir, retirable d'un geste. Un
  // RAPPEL, pas un champ : `q` se modifie toujours dans la barre de navigation (cf. la note en
  // fin de corps), mais le tiroir couvre 90 % de l'écran et la pastille du titre compte `q` —
  // sans ce rappel, elle annonçait « 1 » filtre que rien dans le tiroir ne montrait. Jamais
  // recopié dans « Ville » : `q` est du texte libre, pas une ville.
  const rappelDeRecherche = filters.q ? (
    <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-popover">
      {/* `bg-popover` déclaré sur le libellé lui-même : c'est la surface du tiroir, et la garde de
          contraste (TCK-458) MESURE alors le couple au lieu de le compter parmi ses trous. */}
      <span className="shrink-0 bg-popover text-xs font-medium text-muted-foreground">{t('searchReminder')}</span>
      <button
        type="button"
        onClick={() => set({ q: undefined })}
        aria-label={t('removeSearch', { value: filters.q })}
        className="group flex min-h-10 min-w-0 items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:border-destructive/40 hover:text-destructive"
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{filters.q}</span>
        <X className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden="true" />
      </button>
    </div>
  ) : null;

  const rendreContenu = (rappel?: React.ReactNode) => (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <h2 className="font-display text-base font-semibold text-foreground flex items-center">
          {t('title')}
          {activeCount > 0 && (
            <Badge className="ml-2">{activeCount}</Badge>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={reinitialiser}
              type="button"
              className="flex min-h-9 items-center gap-1 px-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('clearAll')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden size-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {rappel}

      {/* Body */}
      <div className="px-5">

        {/* 1. Transaction */}
        <Section title={t(`sections.contractType`)}>
          <ChipGroup
            options={contractTypes}
            value={filters.contract_type}
            onChange={(v) => set({ contract_type: v as SearchFilters['contract_type'], rent_period: undefined })}
          />
        </Section>

        {/* 2. Property type — multi-select */}
        <Section title={t(`sections.propertyType`)}>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPE_VALUES.map(opt => {
              const selected = filters.type ?? [];
              const isActive = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    const next = isActive
                      ? selected.filter((value) => value !== opt)
                      : [...selected, opt];
                    set({ type: next.length > 0 ? next : undefined });
                  }}
                  className={`min-h-9 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors duration-150 active:scale-[0.96] ${
                    isActive
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                  }`}
                >
                  {tTypes(opt)}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 3. Rent period — conditional */}
        {filters.contract_type === 'rent' && (
          <Section title={t(`sections.rentPeriod`)}>
            <ChipGroup
              options={rentPeriods}
              value={filters.rent_period}
              onChange={(v) => set({ rent_period: v as SearchFilters['rent_period'] })}
            />
          </Section>
        )}

        {/* 4. Location */}
        <Section title={t(`sections.location`)}>
          <div className="space-y-2">
            <Input
              type="text"
              placeholder={t('cityPlaceholder')}
              value={cityDraft}
              onChange={surSaisieLibre(setCityDraft)}
              onBlur={surFinSaisieLibre}
              onKeyDown={surToucheLibre}
              className="rounded-xl"
            />
            <Input
              type="text"
              placeholder={t('quarterPlaceholder')}
              value={locationDraft}
              onChange={surSaisieLibre(setLocationDraft)}
              onBlur={surFinSaisieLibre}
              onKeyDown={surToucheLibre}
              className="rounded-xl"
            />
          </div>
        </Section>

        {/*
          4 bis. Autour de moi — TCK-346.

          Placée JUSTE APRÈS « Localisation », et pas ailleurs : c'est la même intention
          (« où »), et le message de refus de la géolocalisation renvoie explicitement au champ
          « Ville » qui la précède. Les mettre à distance rendrait ce renvoi incompréhensible.
        */}
        <Section title={t(`sections.aroundMe`)}>
          <AutourDeMoi
            lat={filters.lat}
            lng={filters.lng}
            radiusKm={filters.radius_km}
            onChange={set}
            geolocalisation={geolocalisation}
          />
        </Section>

        {/* 5. Budget */}
        <Section title={t(`sections.budget`)}>
          <RangeInputs
            placeholderMin={t('min')}
            placeholderMax={t('max')}
            valueMin={priceMinDraft}
            valueMax={priceMaxDraft}
            hint={priceHint || undefined}
            onChangeMin={setPriceMinDraft}
            onChangeMax={setPriceMaxDraft}
            onCommit={commitImmediat}
          />
        </Section>

        {/* 6. Chambres */}
        <Section title={t(`sections.bedrooms`)}>
          <ChipGroup
            options={BEDROOM_OPTIONS}
            value={filters.bedrooms}
            onChange={(v) => set({ bedrooms: v as number })}
          />
        </Section>

        {/* 7. Salles de bain */}
        <Section title={t(`sections.bathrooms`)}>
          <ChipGroup
            options={BATHROOM_OPTIONS}
            value={filters.bathrooms}
            onChange={(v) => set({ bathrooms: v as number })}
          />
        </Section>

        {/* 8. Surface */}
        <Section title={t(`sections.area`)}>
          <RangeInputs
            placeholderMin={t('minArea')}
            placeholderMax={t('maxArea')}
            valueMin={areaMinDraft}
            valueMax={areaMaxDraft}
            onChangeMin={setAreaMinDraft}
            onChangeMax={setAreaMaxDraft}
            onCommit={commitImmediat}
          />
        </Section>

        {/* 9. État */}
        <Section title={t(`sections.condition`)}>
          <div className="space-y-2">
            {/* TCK-508 — l'état DÉCLARÉ, en multi-sélection comme le type : `condition=new,off_plan`
                est un OU côté serveur. Un bien qui ne le renseigne pas ne répond à aucun choix. */}
            <div className="flex flex-wrap gap-2 pb-1">
              {conditionValues.map((opt) => {
                const selected = filters.condition ?? [];
                const isActive = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      const next = isActive
                        ? selected.filter((value) => value !== opt)
                        : [...selected, opt];
                      set({ condition: next.length > 0 ? next : undefined });
                    }}
                    className={`min-h-9 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors duration-150 active:scale-[0.96] ${
                      isActive
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                    }`}
                  >
                    {tConditions(opt)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-pressed={filters.furnished === true}
              onClick={() => set({ furnished: filters.furnished === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-colors duration-150 ${
                filters.furnished === true
                  ? 'bg-primary/5 border-primary text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <span
                className={`relative shrink-0 w-10 h-5 rounded-full transition-colors duration-200 ${
                  filters.furnished === true ? 'bg-primary' : 'bg-secondary'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform duration-200 ${
                    filters.furnished === true ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span className="text-sm font-semibold">{t('furnishedOnly')}</span>
            </button>

            {/* « En vedette » parle la couleur des badges featured — `--accent`, et rien d'autre
                (design-guidelines § Couleurs sémantiques). L'échelle ambre brute de Tailwind
                n'appartenait pas à la palette Lin. */}
            <button
              type="button"
              aria-pressed={filters.featured === true}
              onClick={() => set({ featured: filters.featured === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-colors duration-150 ${
                filters.featured === true
                  ? 'bg-accent border-accent text-accent-foreground'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <Star
                className={`w-4 h-4 shrink-0 ${
                  filters.featured === true ? 'fill-accent-foreground text-accent-foreground' : 'text-muted-foreground'
                }`}
              />
              <span className="text-sm font-semibold">{t('featuredOnly')}</span>
            </button>
          </div>
        </Section>

        {/* 10. Étage */}
        <Section title={t(`sections.floor`)}>
          <ChipGroup
            options={floorOptions}
            value={filters.floor_number}
            onChange={(v) => set({ floor_number: v as number })}
          />
        </Section>

        {/* 11. Statut foncier — TCK-491 */}
        <Section title={t(`sections.titleDeed`)}>
          <ChipGroup
            options={titleTypeOptions}
            value={filters.title_type}
            onChange={(v) => set({ title_type: v as string })}
          />
          {/* Le statut foncier est sans objet pour un lot dans un immeuble (`field-matrix.ts`) :
              sans ce rappel, un filtre actif sur un appartement se lit comme un catalogue vide
              plutôt que comme un critère hors sujet. */}
          <p className="text-xs text-muted-foreground mt-1.5">{t('titleDeedHint')}</p>
        </Section>

        {/* 12. Disponibilité */}
        <Section title={t(`sections.availability`)}>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{t('availableFrom')}</label>
            <DatePicker
              value={filters.available_from ?? ''}
              min={new Date().toISOString().slice(0, 10)}
              onValueChange={(value) => set({ available_from: value || undefined })}
              buttonClassName="rounded-xl"
            />
          </div>
        </Section>

        {/* 13. Tags */}
        <Section title={t(`sections.amenities`)}>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder={t('amenitiesPlaceholder')}
              value={tagsDraft}
              onChange={surSaisieLibre(setTagsDraft)}
              onBlur={surFinSaisieLibre}
              onKeyDown={surToucheLibre}
              className="rounded-xl pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t('amenitiesHint')}</p>
        </Section>

        {/*
          Pas de section « Mots-clés » : `q` se lit ET se modifie dans le champ de recherche de la
          barre de navigation, qui le relit dans l'URL (rechargement compris). Le montrer ici
          aussi en faisait une seconde copie du même paramètre.
        */}

      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — dès `lg` et non `md` (revue design du 2026-09-16) : à 768 px, le rail
          de 264 px laissait 3 colonnes de 128 px à la grille, prix tronqués (« 28 000 000 F C… »).
          Entre 768 et 1023, c'est le tiroir, comme sur mobile. */}
      <aside className="hidden lg:block w-[264px] shrink-0 bg-card rounded-2xl border border-border shadow-sm self-start sticky top-[145px]">
        {rendreContenu()}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <TiroirMobile
          label={t('title')}
          onClose={onClose}
          onOuverture={surOuvertureDuTiroir}
          onRetour={surRetourDansLeTiroir}
          garderLEntree={seanceAEcrit}
          pied={
            <Button
              onClick={() => {
                commitImmediat();
                onClose();
              }}
              className="w-full rounded-full h-12 text-sm font-semibold"
            >
              {/* TCK-556 · F1 — le compte que le tiroir cache, avec un libellé propre au zéro. */}
              {total === null ? t('showResults') : t('showResultsCount', { count: total })}
            </Button>
          }
        >
          {rendreContenu(rappelDeRecherche)}
        </TiroirMobile>
      )}
    </>
  );
}

/** Clé posée dans `history.state` par l'entrée sentinelle du tiroir (TCK-556). */
const MARQUE_TIROIR = '__takussanTiroirFiltres';

const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Le tiroir des filtres sous `lg` — une vraie modale.
 *
 * Il se déclarait `role="dialog" aria-modal` et écoutait Échap sur lui-même, mais le focus
 * restait sur `body` à l'ouverture : Échap ne fermait rien, et un lecteur d'écran se retrouvait
 * dans une modale sans rien de focalisé (relecture adverse de la revue design du 2026-09-16,
 * reproduit à 390 px). Désormais : le panneau prend le focus à l'ouverture, Échap est écouté sur
 * `document`, Tab tourne dans le tiroir, et le focus revient au déclencheur à la fermeture.
 *
 * ## Le geste retour ferme le tiroir — TCK-556
 *
 * Mesuré à 360 px avant ce ticket : deux puces touchées tiroir ouvert empilaient deux entrées
 * (`history.length` 2 → 4), et un retour arrière rendait `type=villa` au lieu de
 * `type=villa,house` **en laissant le tiroir ouvert**. Sur Android, le geste retour — le réflexe
 * pour fermer un panneau — défaisait donc un filtre, sous le tiroir, sans que rien ne le montre.
 *
 * Le mécanisme, et pourquoi chaque pièce :
 *
 * 1. **À l'ouverture, une entrée SENTINELLE** à la même URL (`pushState` direct : l'état de Next
 *    est recopié, marqué `__NA`, donc le routeur ne la voit pas comme une navigation). Sans elle,
 *    le retour n'aurait rien d'autre à dépiler que la page elle-même.
 * 2. **Tiroir ouvert, tout commit écrase** (`continu`, cf. `FilterSidebarProps.onFilterChange`) :
 *    la sentinelle porte l'état courant de la séance, et rien ne s'empile au-dessus.
 * 3. **Au `popstate`**, le navigateur a ramené l'entrée d'avant le tiroir. `onRetour` ferme ; si
 *    la séance a écrit, il revient EN AVANT sur la sentinelle — l'entrée de la séance, qui porte
 *    son URL et l'arbre du routeur. Pas de navigation : deux restaurations depuis le cache.
 * 4. **Toute autre fermeture** (bouton, Échap, voile) rend la sentinelle par `history.back()`
 *    si la séance n'a rien écrit (sans quoi elle resterait comme un appui perdu), et la garde
 *    sinon : elle EST alors l'entrée de la séance.
 *
 * Résultat identique par les deux chemins : la séance du tiroir vaut une entrée d'historique, ou
 * zéro, et le retour suivant la défait d'un coup. Tiroir fermé, rien de ceci ne s'applique et
 * la taxonomie de TCK-335 (un geste discret = une entrée) est inchangée.
 *
 * ⚠ **StrictMode** monte, démonte et remonte l'effet : la sentinelle porte un jeton propre à ce
 * tiroir, qui empêche le remontage d'en poser une seconde, et le `history.back()` du démontage est
 * DIFFÉRÉ d'une tâche pour que le remontage puisse l'annuler. Sans ces deux gardes, le tiroir se
 * refermait tout seul en développement.
 */
function TiroirMobile({
  label,
  onClose,
  onOuverture,
  onRetour,
  garderLEntree,
  pied,
  children,
}: {
  readonly label: string;
  readonly onClose: () => void;
  /** Appelé une fois l'entrée sentinelle posée. */
  readonly onOuverture: () => void;
  /** Retour arrière tiroir ouvert : fermer, et revenir sur l'entrée de la séance. */
  readonly onRetour: () => void;
  /** Lu à la fermeture hors retour : la séance a-t-elle écrit dans l'historique ? */
  readonly garderLEntree: () => boolean;
  readonly pied: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  const panneau = React.useRef<HTMLDivElement>(null);

  // Les rappels du parent changent à chaque rendu ; l'effet d'historique, lui, ne doit vivre
  // qu'une fois par ouverture. Il les lit donc ici, à jour.
  const rappels = React.useRef({ onOuverture, onRetour, garderLEntree });
  React.useEffect(() => {
    rappels.current = { onOuverture, onRetour, garderLEntree };
  });

  const jeton = React.useRef<string | null>(null);
  const rendreDiffere = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (rendreDiffere.current !== null) {
      window.clearTimeout(rendreDiffere.current);
      rendreDiffere.current = null;
    }
    const etat = window.history.state as Record<string, unknown> | null;
    if (jeton.current === null || etat?.[MARQUE_TIROIR] !== jeton.current) {
      jeton.current = `tiroir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.history.pushState({ ...etat, [MARQUE_TIROIR]: jeton.current }, '', window.location.href);
      rappels.current.onOuverture();
    }

    let fermeParRetour = false;
    const surRetour = () => {
      fermeParRetour = true;
      rappels.current.onRetour();
    };
    window.addEventListener('popstate', surRetour);

    return () => {
      window.removeEventListener('popstate', surRetour);
      if (fermeParRetour) return;
      const jetonCourant = jeton.current;
      rendreDiffere.current = window.setTimeout(() => {
        rendreDiffere.current = null;
        if (rappels.current.garderLEntree()) return;
        // Ne dépiler QUE notre sentinelle : si l'entrée courante n'est plus la nôtre, quelqu'un
        // d'autre a navigué depuis, et `back()` défairait sa navigation.
        const courant = window.history.state as Record<string, unknown> | null;
        if (courant?.[MARQUE_TIROIR] === jetonCourant) window.history.back();
      }, 0);
    };
  }, []);

  // Montage seul : le focus entre, puis revient au déclencheur quand le tiroir se démonte.
  React.useEffect(() => {
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panneau.current?.focus();
    return () => precedent?.focus();
  }, []);

  React.useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panneau.current) return;
      const cibles = [...panneau.current.querySelectorAll<HTMLElement>(FOCALISABLES)];
      if (cibles.length === 0) return;
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];
      const actif = document.activeElement;
      if (e.shiftKey && (actif === premier || actif === panneau.current)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault();
        premier.focus();
      } else if (!panneau.current.contains(actif)) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onClose]);

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-scrim/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative w-full md:mx-auto md:max-w-2xl bg-popover rounded-t-3xl max-h-[90dvh] flex flex-col shadow-lg outline-none animate-in slide-in-from-bottom duration-300"
      >
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <div className="px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border bg-popover shrink-0">
          {pied}
        </div>
      </div>
    </div>
  );
}
