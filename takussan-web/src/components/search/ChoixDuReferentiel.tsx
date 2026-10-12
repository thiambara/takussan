'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

import {
  Combobox,
  ComboboxMultiple,
  replierPourIdentite,
  type OptionDeListe,
} from '@/components/ui/combobox';
import { ESPACE_DU_CATALOGUE } from '@/lib/libelle-equipement';
import { libelleEquipementParNom } from '@/lib/libelle-equipement-par-nom';
import {
  useEquipementsApprouves,
  useQuartiersDuReferentiel,
  useRegionsDuReferentiel,
  useVillesDuReferentiel,
} from '@/lib/queries/referentiel-public';
import type { GeoCity, GeoRegion } from '@/types/geo';

/**
 * TCK-633 (lot E) — ville, quartier et équipements se CHOISISSENT dans des listes.
 *
 * C'étaient trois champs de texte libre : une faute de frappe (« Dakr », « Liberte 4 ») rendait
 * 0 résultat sans un mot, la recherche comparant par égalité (ADR-0062, contexte). Les listes
 * viennent du référentiel (villes, quartiers) et du catalogue approuvé (équipements) ; le panneau
 * reçoit toujours un NOM canonique, que la recherche compare tel quel.
 *
 * ⚠ Ce fichier est le SEUL importateur de `@/components/ui/combobox` (primitive du lot D) côté
 * recherche : si la primitive change d'API, c'est ici, et nulle part ailleurs, qu'on l'adapte. Ses
 * tests s'écrivent par rôles ARIA pour la même raison. L'option « créer » de la primitive n'est pas
 * employée : on ne filtre pas sur un nom que le référentiel ignore.
 */

export interface ChoixDeVilleProps {
  readonly valeur: string | undefined;
  /** TCK-635 (ADR-0062 §8) — la région, posée seulement pour une ville homonyme. */
  readonly region?: string | undefined;
  /** `region` n'est rendue que pour une ville homonyme ; `undefined` partout ailleurs. */
  readonly onChange: (ville: string | undefined, region?: string) => void;
}

export interface ChoixDeQuartierProps {
  /** Le nom de la ville choisie — le quartier ne se choisit qu'à l'intérieur d'une ville. */
  readonly ville: string | undefined;
  /** Sa région, quand le nom seul ne la désigne pas. */
  readonly region?: string | undefined;
  readonly valeur: string | undefined;
  readonly onChange: (valeur: string | undefined) => void;
}

export interface ChoixDEquipementsProps {
  readonly valeurs: readonly string[];
  readonly onChange: (valeurs: string[]) => void;
}

/** Un nom du référentiel en option de liste : la valeur EST le nom, que la recherche compare. */
function option(nom: string): OptionDeListe {
  return { value: nom, label: nom };
}

/**
 * Les noms proposés, la valeur courante en tête quand le référentiel ne la connaît pas (une URL
 * ancienne, un lien partagé) : elle reste VISIBLE, donc retirable, au lieu de disparaître du champ
 * pendant que la liste la filtre encore. Chaque nom n'y figure qu'une fois : deux options de même
 * valeur donnent deux enfants de même clé.
 */
export function optionsAvecLaValeur(noms: readonly string[], valeur: string | undefined): OptionDeListe[] {
  const uniques = [...new Set(noms)];
  if (!valeur || uniques.includes(valeur)) return uniques.map(option);
  return [valeur, ...uniques].map(option);
}

/**
 * TCK-635 (ADR-0062 §8) — le référentiel porte trois paires de villes homonymes, chacune dans deux
 * régions : Dinguiraye (Diourbel, Kolda), Missirah (Diourbel, Tambacounda), Vélingara (Matam,
 * Kolda). Une option par VILLE, donc, et non par nom : la valeur d'une homonyme porte sa région
 * (séparateur invisible, qu'aucun nom ne contient), son libellé l'affiche — « Dinguiraye (Kolda) ».
 * Les autres villes gardent leur nom seul, en valeur comme en libellé.
 */
const SEPARATEUR_DE_REGION = '\u001f';

function valeurDeVille(ville: string, region: string | undefined): string {
  return region ? `${ville}${SEPARATEUR_DE_REGION}${region}` : ville;
}

function libelleDeVille(ville: string, region: string | undefined): string {
  return region ? `${ville} (${region})` : ville;
}

/** L'inverse de {@link valeurDeVille} : le nom, et la région quand la valeur en porte une. */
export function villeDeValeur(valeur: string): { readonly ville: string; readonly region?: string } {
  const [ville, region] = valeur.split(SEPARATEUR_DE_REGION);
  return region ? { ville, region } : { ville };
}

/**
 * Les villes proposées : une option par ville, la région au libellé des seules homonymes. Tant que
 * les régions n'ont pas répondu, deux homonymes restent une seule option (aucune clé en double).
 * La valeur courante reste en tête si la liste ne la connaît pas — y compris `city=Dinguiraye` sans
 * région (un lien d'avant le départage), qui trouve les biens des deux.
 */
export function optionsDeVilles(
  villes: readonly GeoCity[],
  regions: readonly GeoRegion[],
  valeur: string | undefined,
  region: string | undefined,
): OptionDeListe[] {
  const nomDeRegion = new Map(regions.map((r) => [r.id, r.name]));
  const occurrences = new Map<string, number>();
  for (const v of villes) occurrences.set(v.name, (occurrences.get(v.name) ?? 0) + 1);

  const options = new Map<string, OptionDeListe>();
  for (const v of villes) {
    const regionAffichee = (occurrences.get(v.name) ?? 0) > 1 ? nomDeRegion.get(v.region_id) : undefined;
    const cle = valeurDeVille(v.name, regionAffichee);
    if (!options.has(cle)) options.set(cle, { value: cle, label: libelleDeVille(v.name, regionAffichee) });
  }

  if (valeur) {
    const courante = valeurDeVille(valeur, region);
    if (!options.has(courante)) {
      return [{ value: courante, label: libelleDeVille(valeur, region) }, ...options.values()];
    }
  }
  return [...options.values()];
}

/**
 * L'identifiant de la ville de l'URL, retrouvée par son nom à la casse près (`city=dakar` tapé à la
 * main, règle d'identité d'ADR-0025), puis par sa région si le nom est porté par deux villes. Une
 * homonyme sans région ne désigne aucune des deux : `null`, plutôt que la première venue.
 */
export function villeDuReferentiel(
  villes: readonly GeoCity[],
  regions: readonly GeoRegion[],
  ville: string | undefined,
  region: string | undefined,
): number | null {
  if (!ville) return null;
  const candidates = villes.filter((v) => replierPourIdentite(v.name) === replierPourIdentite(ville));
  if (candidates.length <= 1) return candidates[0]?.id ?? null;
  if (!region) return null;
  const regionId = regions.find((r) => replierPourIdentite(r.name) === replierPourIdentite(region))?.id;
  return candidates.find((v) => v.region_id === regionId)?.id ?? null;
}

function BoutonDeRetrait({ libelle, onClick }: { readonly libelle: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

interface ChampDeListeProps {
  readonly libelle: string;
  readonly placeholder: string;
  readonly vide: string;
  readonly libelleRetrait: string;
  readonly options: readonly OptionDeListe[];
  readonly valeur: string | undefined;
  readonly onChange: (valeur: string | undefined) => void;
  readonly chargement?: boolean;
  readonly disabled?: boolean;
}

function ChampDeListe({
  libelle,
  placeholder,
  vide,
  libelleRetrait,
  options,
  valeur,
  onChange,
  chargement = false,
  disabled = false,
}: ChampDeListeProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <Combobox
          options={options}
          value={valeur ?? null}
          onChange={(choisie) => onChange(choisie?.value ?? undefined)}
          label={libelle}
          placeholder={placeholder}
          aucunResultat={vide}
          chargement={chargement}
          disabled={disabled}
        />
      </div>
      {valeur ? <BoutonDeRetrait libelle={libelleRetrait} onClick={() => onChange(undefined)} /> : null}
    </div>
  );
}

export function ChoixDeVille({ valeur, region, onChange }: ChoixDeVilleProps) {
  const t = useTranslations('search.filters');
  const villes = useVillesDuReferentiel();
  const regions = useRegionsDuReferentiel();

  return (
    <ChampDeListe
      libelle={t('place.city')}
      placeholder={t('place.cityPlaceholder')}
      vide={t('place.noCity')}
      libelleRetrait={t('place.clearCity')}
      options={optionsDeVilles(villes.data?.data ?? [], regions.data?.data ?? [], valeur, region)}
      valeur={valeur ? valeurDeVille(valeur, region) : undefined}
      onChange={(choisie) => {
        if (choisie === undefined) return onChange(undefined);
        const { ville, region: regionChoisie } = villeDeValeur(choisie);
        return regionChoisie ? onChange(ville, regionChoisie) : onChange(ville);
      }}
      chargement={villes.isLoading}
    />
  );
}

export function ChoixDeQuartier({ ville, region, valeur, onChange }: ChoixDeQuartierProps) {
  const t = useTranslations('search.filters');
  const villes = useVillesDuReferentiel();
  const regions = useRegionsDuReferentiel();
  const villeId = villeDuReferentiel(villes.data?.data ?? [], regions.data?.data ?? [], ville, region);
  const quartiers = useQuartiersDuReferentiel(villeId);
  const noms = (quartiers.data?.data ?? []).map((quartier) => quartier.name);
  const sansVille = !ville;

  return (
    <ChampDeListe
      libelle={t('place.quarter')}
      placeholder={sansVille ? t('place.quarterNeedsCity') : t('place.quarterPlaceholder')}
      vide={t('place.noQuarter')}
      libelleRetrait={t('place.clearQuarter')}
      options={optionsAvecLaValeur(noms, valeur)}
      valeur={valeur}
      onChange={onChange}
      chargement={villeId !== null && quartiers.isLoading}
      disabled={sansVille}
    />
  );
}

/**
 * Équipements : un ET côté serveur (décision 4 du porteur) — `tags=Piscine,Parking` ne rend que
 * les biens qui offrent les deux. Le rappel sous le champ le dit.
 *
 * La VALEUR d'une option reste le nom canonique (celui que la recherche compare) ; son LIBELLÉ est
 * traduit pour un équipement du catalogue, tel quel pour un équipement d'annonceur
 * (`libelleEquipementParNom`). La primitive filtre sur le libellé : « pool » trouve « Swimming pool ».
 */
export function ChoixDEquipements({ valeurs, onChange }: ChoixDEquipementsProps) {
  const t = useTranslations('search.filters');
  const tCatalogue = useTranslations(ESPACE_DU_CATALOGUE);
  const equipements = useEquipementsApprouves();
  const catalogue = equipements.data?.data ?? [];
  const noms = catalogue.map((equipement) => equipement.name);
  const optionDe = (nom: string): OptionDeListe => ({
    value: nom,
    label: libelleEquipementParNom(nom, tCatalogue, catalogue),
  });
  // Un équipement de l'URL que le catalogue ignore reste une puce, donc retirable.
  const options = [...valeurs.filter((v) => !noms.includes(v)), ...noms].map(optionDe);

  return (
    <ComboboxMultiple
      options={options}
      valeurs={valeurs.map(optionDe)}
      onChange={(choisies) => onChange(choisies.map((o) => o.value))}
      label={t('sections.amenities')}
      placeholder={t('amenityPicker.placeholder')}
      aucunResultat={t('amenityPicker.empty')}
      retirer={(nom) => t('amenityPicker.remove', { name: nom })}
      chargement={equipements.isLoading}
    />
  );
}
