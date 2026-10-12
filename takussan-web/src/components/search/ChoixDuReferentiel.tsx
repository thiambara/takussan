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
  useVillesDuReferentiel,
} from '@/lib/queries/referentiel-public';

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
  readonly onChange: (valeur: string | undefined) => void;
}

export interface ChoixDeQuartierProps extends ChoixDeVilleProps {
  /** Le nom de la ville choisie — le quartier ne se choisit qu'à l'intérieur d'une ville. */
  readonly ville: string | undefined;
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
 * pendant que la liste la filtre encore.
 */
export function optionsAvecLaValeur(noms: readonly string[], valeur: string | undefined): OptionDeListe[] {
  if (!valeur || noms.includes(valeur)) return noms.map(option);
  return [valeur, ...noms].map(option);
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

export function ChoixDeVille({ valeur, onChange }: ChoixDeVilleProps) {
  const t = useTranslations('search.filters');
  const villes = useVillesDuReferentiel();
  const noms = (villes.data?.data ?? []).map((ville) => ville.name);

  return (
    <ChampDeListe
      libelle={t('place.city')}
      placeholder={t('place.cityPlaceholder')}
      vide={t('place.noCity')}
      libelleRetrait={t('place.clearCity')}
      options={optionsAvecLaValeur(noms, valeur)}
      valeur={valeur}
      onChange={onChange}
      chargement={villes.isLoading}
    />
  );
}

export function ChoixDeQuartier({ ville, valeur, onChange }: ChoixDeQuartierProps) {
  const t = useTranslations('search.filters');
  const villes = useVillesDuReferentiel();
  // La ville de l'URL est un NOM : on la retrouve à la casse près (`city=dakar` tapé à la main),
  // la règle d'identité du référentiel (ADR-0025 — accents non repliés).
  const villeId = ville
    ? ((villes.data?.data ?? []).find((v) => replierPourIdentite(v.name) === replierPourIdentite(ville))?.id ?? null)
    : null;
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
