import type { PropertyDetail, PropertyTag } from '@/types/property';
import { type CompareRow, highlightDivergent, type HighlightedRow } from '@/lib/compare';
import { formatPrice } from '@/lib/utils';

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
  { id: 'city', labelKey: 'city', category: 'location' },
  { id: 'quarter', labelKey: 'quarter', category: 'location' },
  { id: 'area', labelKey: 'area', category: 'interior' },
  { id: 'bedrooms', labelKey: 'bedrooms', category: 'interior' },
  { id: 'bathrooms', labelKey: 'bathrooms', category: 'interior' },
  { id: 'floor_number', labelKey: 'floor', category: 'interior' },
  { id: 'furnished', labelKey: 'furnished', category: 'interior' },
  { id: 'year_built', labelKey: 'yearBuilt', category: 'exterior' },
  { id: 'parking_spaces', labelKey: 'parking', category: 'exterior' },
  { id: 'amenities', labelKey: 'amenities', category: 'amenities' },
  { id: 'tags', labelKey: 'tags', category: 'amenities' },
] as const;

function amenityNames(tags: PropertyTag[] | undefined): string[] {
  if (!tags) return [];
  return tags
    .filter((tag) => tag.type === 'amenity')
    .map((tag) => tag.name)
    .sort((a, b) => a.localeCompare(b));
}

function otherTagNames(tags: PropertyTag[] | undefined): string[] {
  if (!tags) return [];
  return tags
    .filter((tag) => tag.type !== 'amenity')
    .map((tag) => tag.name)
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
    case 'city':
      return property.location?.city ?? null;
    case 'quarter':
      return property.location?.quarter ?? null;
    case 'area':
      return property.area ?? null;
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
      return amenityNames(property.tags);
    case 'tags':
      return otherTagNames(property.tags);
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
): HighlightedRow<CompareCell>[] {
  const rows: CompareRow<CompareCell>[] = COMPARE_ROW_DEFS.map((def) => ({
    id: def.id,
    values: properties.map((property) => buildCell(def, property)),
  }));
  return highlightDivergent<CompareCell>(rows);
}
