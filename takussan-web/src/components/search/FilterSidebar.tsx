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
import { titleTypeValues } from '@/lib/schemas/property';
import type { SearchFilters } from '@/types/search';

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
            onClick={() => onChange(isActive ? undefined : opt.value)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-all duration-150 ${
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
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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
   */
  onFilterChange: (patch: Partial<SearchFilters>, options?: { continu?: boolean }) => void;
  onReset: () => void;
  activeCount: number;
  open: boolean;
  onClose: () => void;
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
  debounceMs = DEBOUNCE_CHAMPS_LIBRES_MS,
  geolocalisation,
}: FilterSidebarProps) {
  const t = useTranslations('search.filters');
  const tTypes = useTranslations('property.types');
  const tContract = useTranslations('property.contractTypes');
  const tPeriods = useTranslations('property.rentPeriods');
  const tTitleTypes = useTranslations('property.titleTypes');

  // ── Brouillons : la valeur AFFICHÉE est locale et immédiate ; `filters` ne fait que la
  //    resynchroniser quand l'URL change réellement (retour arrière, « Tout effacer », puce
  //    retirée depuis la barre d'outils).
  const [cityDraft, setCityDraft] = useStateSyncedWith(filters.city ?? '');
  const [locationDraft, setLocationDraft] = useStateSyncedWith(filters.location ?? '');
  const [tagsDraft, setTagsDraft] = useStateSyncedWith(filters.tags ?? '');
  const [qDraft, setQDraft] = useStateSyncedWith(filters.q ?? '');
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
  if (texteVersFiltre(qDraft) !== filters.q) {
    brouillonEnAttente.q = texteVersFiltre(qDraft);
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

  const commitBrouillon = () => {
    if (!aUnBrouillon) return;
    onFilterChange({ ...brouillonEnAttente, page: 1 }, { continu: true });
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
    onFilterChange({ ...brouillonEnAttente, ...patch, page: 1 });
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

  const content = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <h2 className="text-base font-bold text-foreground flex items-center">
          {t('title')}
          {activeCount > 0 && (
            <Badge className="ml-2">{activeCount}</Badge>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={() => {
                differe.cancel();
                onReset();
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('clearAll')}
            </button>
          )}
          <button
            onClick={onClose}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

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
                  onClick={() => {
                    const next = isActive
                      ? selected.filter((value) => value !== opt)
                      : [...selected, opt];
                    set({ type: next.length > 0 ? next : undefined });
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all duration-150 ${
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
            <button
              onClick={() => set({ furnished: filters.furnished === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
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

            <button
              onClick={() => set({ featured: filters.featured === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
                filters.featured === true
                  ? 'bg-amber-50 border-amber-400 text-amber-700'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <Star
                className={`w-4 h-4 shrink-0 ${
                  filters.featured === true ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
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
          <p className="text-[11px] text-muted-foreground mt-1.5">{t('titleDeedHint')}</p>
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
          <p className="text-[11px] text-muted-foreground mt-1.5">{t('amenitiesHint')}</p>
        </Section>

        {/* 14. Full-text search */}
        <Section title={t(`sections.advanced`)}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder={t('advancedPlaceholder')}
              value={qDraft}
              onChange={surSaisieLibre(setQDraft)}
              onBlur={surFinSaisieLibre}
              onKeyDown={surToucheLibre}
              className="rounded-xl pl-9"
            />
          </div>
        </Section>

      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-[264px] shrink-0 bg-card rounded-2xl border border-border shadow-sm self-start sticky top-[145px]">
        {content}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-scrim/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative bg-popover rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex-1 overflow-y-auto">
              {content}
            </div>
            <div className="px-5 py-4 border-t border-border bg-popover shrink-0">
              <Button
                onClick={() => {
                  commitImmediat();
                  onClose();
                }}
                className="w-full rounded-full h-12 text-sm font-semibold"
              >
                {t('showResults')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
