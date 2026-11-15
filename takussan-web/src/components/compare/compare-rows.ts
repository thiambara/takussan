import type { PropertyDetail, PropertyTag } from '@/types/property';
import { type CompareRow, highlightDivergent, type HighlightedRow } from '@/lib/compare';
import { formatPrice } from '@/lib/utils';

/**
 * TCK-633 — le libellé d'un équipement à l'écran : `libelleEquipement(tag, t)` (lot D), que le
 * composant lie à son traducteur du catalogue. Absent (un appelant hors React), le nom en base.
 */
export type LibelleDEquipement = (tag: PropertyTag) => string;

const NOM_EN_BASE: LibelleDEquipement = (tag) => tag.name;

/**
 * TCK-082 — transforms the list of fetched properties into a stable set
 * of comparison rows. Keeping the schema centralized here makes the
 * desktop table and the mobile carousel share the exact same dataset.
 */

export type CompareCell = string | number | boolean | string[] | null | undefined;

export type CompareRowDef = {
  id: string;
  /** Translatable label key under `compare.rows`. */
  labelKey: string;
  /** Category header, also translated under `compare.rows`. */
  category: 'general' | 'location' | 'interior' | 'exterior' | 'amenities';
};

/** Ordered row definitions — drives the table layout. */
export const COMPARE_ROW_DEFS: readonly CompareRowDef[] = [
  { id: 'price', labelKey: 'price', category: 'general' },
  { id: 'contract_type', labelKey: 'contractType', category: 'general' },
  { id: 'type', labelKey: 'type', category: 'general' },
  { id: 'rent_period', labelKey: 'rentPeriod', category: 'general' },
  // TCK-598 (V9) — ce qu'il faut verser pour emménager : deux loyers égaux ne coûtent pas la même
  // chose à l'entrée. Le TOTAL calculé par l'API, jamais une addition refaite ici.
  { id: 'entry_cost', labelKey: 'entryCost', category: 'general' },
  // TCK-491 — au Sénégal, le statut foncier départage deux terrains au même prix : il se lit avec
  // les critères qui décident, pas noyé dans les équipements.
  { id: 'title_type', labelKey: 'titleDeed', category: 'general' },
  { id: 'city', labelKey: 'city', category: 'location' },
  { id: 'quarter', labelKey: 'quarter', category: 'location' },
  { id: 'area', labelKey: 'area', category: 'interior' },
  // TCK-2509 — calculé ici (prix ÷ surface), seulement quand les deux existent : souvent ce qui
  // départage deux biens au loyer proche. Le libellé suit le contrat (cf. `cleDuLibelle`).
  { id: 'price_per_m2', labelKey: 'pricePerM2', category: 'interior' },
  { id: 'bedrooms', labelKey: 'bedrooms', category: 'interior' },
  { id: 'bathrooms', labelKey: 'bathrooms', category: 'interior' },
  { id: 'floor_number', labelKey: 'floor', category: 'interior' },
  { id: 'furnished', labelKey: 'furnished', category: 'interior' },
  { id: 'year_built', labelKey: 'yearBuilt', category: 'exterior' },
  { id: 'parking_spaces', labelKey: 'parking', category: 'exterior' },
  { id: 'amenities', labelKey: 'amenities', category: 'amenities' },
  { id: 'tags', labelKey: 'tags', category: 'amenities' },
] as const;

function amenityNames(tags: PropertyTag[] | undefined, libelle: LibelleDEquipement): string[] {
  if (!tags) return [];
  // Trié sur le libellé AFFICHÉ : l'ordre suit la langue de l'écran, pas le nom français en base.
  return tags
    .filter((tag) => tag.type === 'amenity')
    .map(libelle)
    .sort((a, b) => a.localeCompare(b));
}

// TCK-924 — même traducteur, même tri que les équipements : un `feature` du catalogue que
// `tags:sync-catalog` n'a pas encore converti se lit dans la langue de l'écran.
function otherTagNames(tags: PropertyTag[] | undefined, libelle: LibelleDEquipement): string[] {
  if (!tags) return [];
  return tags
    .filter((tag) => tag.type !== 'amenity')
    .map(libelle)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Extracts one cell value per property for the given row definition.
 * Properties passed as `null` are rendered as placeholders on the UI —
 * we keep `null` in the array so the column count stays stable.
 */
export function buildCell(
  def: CompareRowDef,
  property: PropertyDetail | null,
  libelleEquipement: LibelleDEquipement = NOM_EN_BASE,
): CompareCell {
  if (!property) return null;

  switch (def.id) {
    case 'price':
      // Pre-format with the property's own currency. Returning the raw
      // number here would force the renderer to assume a single currency
      // (originally hardcoded to XOF) and display EUR/USD/XAF listings
      // with the wrong symbol. Pre-formatted strings also give
      // `highlightDivergent` the correct divergence signal across mixed
      // currencies.
      return formatPrice(property.price, property.currency || 'XOF');
    case 'contract_type':
      return property.contract_type_label ?? property.contract_type ?? null;
    case 'type':
      return property.type_label ?? property.type ?? null;
    case 'rent_period':
      return property.rent_period_label ?? property.rent_period ?? null;
    case 'entry_cost':
      return property.entry_cost
        ? formatPrice(property.entry_cost.total, property.currency || 'XOF')
        : null;
    // Le libellé vient de l'API, dans la langue négociée — le même que celui de la fiche. Aucun
    // second vocabulaire côté front : `DIVERGENCES_CONNUES` de la garde de parité ne grossit pas.
    case 'title_type':
      return property.title_type_label ?? null;
    case 'city':
      return property.location?.city ?? null;
    case 'quarter':
      return property.location?.quarter ?? null;
    case 'area':
      return property.area ?? null;
    case 'price_per_m2': {
      const parM2 = prixAuM2(property);
      return parM2 === null ? null : formatPrice(parM2, property.currency || 'XOF');
    }
    case 'bedrooms':
      return property.bedrooms ?? null;
    case 'bathrooms':
      return property.bathrooms ?? null;
    case 'floor_number':
      return property.floor_number ?? null;
    case 'furnished':
      return property.furnished;
    case 'year_built':
      return property.year_built ?? null;
    case 'parking_spaces':
      return property.parking_spaces ?? null;
    case 'amenities':
      return amenityNames(property.tags, libelleEquipement);
    case 'tags':
      return otherTagNames(property.tags, libelleEquipement);
    default:
      return null;
  }
}

/**
 * Build the full matrix of rows × columns and flag diverging rows. The
 * returned array is ready to render.
 */
export function buildCompareRows(
  properties: readonly (PropertyDetail | null)[],
  libelleEquipement: LibelleDEquipement = NOM_EN_BASE,
): LigneComparee[] {
  const rows: CompareRow<CompareCell>[] = COMPARE_ROW_DEFS.map((def) => ({
    id: def.id,
    values: properties.map((property) => buildCell(def, property, libelleEquipement)),
  })).filter((row) => row.values.some(porteUneValeur));
  return highlightDivergent<CompareCell>(rows).map((row) => ({
    ...row,
    meilleurs: meilleursDeLaLigne(row.id, properties),
  }));
}

/** Une ligne prête à rendre : ses valeurs, si elles diffèrent, et les colonnes qui portent le meilleur. */
export type LigneComparee = HighlightedRow<CompareCell> & {
  /** Les index des colonnes marquées « le meilleur » — vide quand la ligne n'en a pas. */
  readonly meilleurs: readonly number[];
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-2509 — le meilleur de chaque ligne, seulement là où « meilleur » a un sens
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * La table des critères qui ont un meilleur, et son sens. Tout critère absent est NEUTRE : l'étage,
 * le meublé, le quartier, les équipements, les chambres (plus n'est pas mieux pour tout le monde)
 * ne se classent pas — c'est au visiteur de dire ce qu'il préfère.
 */
export const SENS_DU_MEILLEUR: Readonly<Record<string, 'min' | 'max'>> = {
  price: 'min',
  entry_cost: 'min',
  price_per_m2: 'min',
  area: 'max',
};

/**
 * Les lignes d'ARGENT : comparer deux montants n'a de sens que dans la même devise, pour le même
 * contrat et la même période — une vente n'est pas « plus chère » qu'un loyer au mois, ni un loyer
 * à la nuit « moins cher » qu'un loyer au mois. Hors de ce cas, la ligne reste sans marque.
 */
const LIGNES_D_ARGENT: ReadonlySet<string> = new Set(['price', 'entry_cost', 'price_per_m2']);

/** Le loyer (ou le prix) au m², arrondi à l'unité affichée ; `null` sans prix ou sans surface. */
export function prixAuM2(property: PropertyDetail): number | null {
  const { price, area } = property;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) return null;
  return Math.round(price / area);
}

function valeurClassable(id: string, property: PropertyDetail): number | null {
  const brute = (() => {
    switch (id) {
      case 'price':
        return property.price;
      case 'entry_cost':
        return property.entry_cost?.total ?? null;
      case 'price_per_m2':
        return prixAuM2(property);
      case 'area':
        return property.area;
      default:
        return null;
    }
  })();
  return typeof brute === 'number' && Number.isFinite(brute) && brute > 0 ? brute : null;
}

/**
 * Les colonnes qui portent le meilleur d'une ligne. Vide quand : la ligne est neutre ; moins de deux
 * biens ont une valeur ; tous ont la même (il n'y a pas de meilleur) ; ou, pour l'argent, les biens
 * ne se comparent pas (devise, contrat ou période différents). Les ex æquo sont tous marqués.
 */
export function meilleursDeLaLigne(
  id: string,
  properties: readonly (PropertyDetail | null)[],
): number[] {
  const sens = SENS_DU_MEILLEUR[id];
  if (!sens) return [];

  const valeurs = properties.map((p) => (p ? { p, v: valeurClassable(id, p) } : null));
  const presents = valeurs
    .map((x, index) => (x && x.v !== null ? { index, p: x.p, v: x.v } : null))
    .filter((x): x is { index: number; p: PropertyDetail; v: number } => x !== null);
  if (presents.length < 2) return [];

  if (LIGNES_D_ARGENT.has(id)) {
    // Une location sans période déclarée est au mois (même convention que l'histogramme de prix,
    // TCK-2498) ; hors location, la période ne compte pas.
    const signature = (p: PropertyDetail) =>
      `${p.currency || 'XOF'}|${p.contract_type ?? ''}|${p.contract_type === 'rent' ? (p.rent_period ?? 'monthly') : ''}`;
    const premiere = signature(presents[0].p);
    if (presents.some(({ p }) => signature(p) !== premiere)) return [];
  }

  const nombres = presents.map(({ v }) => v);
  const meilleur = sens === 'min' ? Math.min(...nombres) : Math.max(...nombres);
  if (nombres.every((v) => v === meilleur)) return [];
  return presents.filter(({ v }) => v === meilleur).map(({ index }) => index);
}

/**
 * La clé du libellé d'une ligne sous `compare.rows`. « Loyer au m² » quand tous les biens qui ont
 * une valeur sont des locations, « Prix au m² » sinon (une vente, un terrain) : le nom de la ligne
 * dit ce qu'elle divise.
 */
export function cleDuLibelle(def: CompareRowDef, properties: readonly (PropertyDetail | null)[]): string {
  if (def.id !== 'price_per_m2') return def.labelKey;
  const avecValeur = properties.filter((p): p is PropertyDetail => p !== null && prixAuM2(p) !== null);
  return avecValeur.length > 0 && avecValeur.every((p) => p.contract_type === 'rent')
    ? 'rentPerM2'
    : def.labelKey;
}

/**
 * TCK-491 — une ligne dont AUCUNE colonne ne porte de valeur ne s'affiche pas.
 *
 * Le comparateur existe pour montrer ce qui **diverge** ; une ligne de tirets alignés n'apprend
 * rien et pousse le reste hors de l'écran. La règle est unique — elle vaut pour le statut foncier
 * comme pour la périodicité d'un loyer entre deux ventes — parce qu'une exception par ligne est
 * exactement ce qui finit par diverger.
 *
 * ⚠ `false` PORTE une valeur : « non meublé » des deux côtés est une information, pas une absence.
 * Un test l'épingle — la confusion entre `false` et « vide » est le défaut classique de ce filtre.
 */
function porteUneValeur(cellule: CompareCell): boolean {
  if (cellule === null || cellule === undefined || cellule === '') return false;
  if (Array.isArray(cellule)) return cellule.length > 0;
  return true;
}
