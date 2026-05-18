import type { FormSelectOption } from '@/components/forms/FormSelect';
import {
  contractTypeValues,
  currencyValues,
  propertyStatusValues,
  propertyTypeValues,
  propertyVisibilityValues,
  rentPeriodValues,
} from '@/lib/schemas/property';

/**
 * Human-readable labels for the property enums. Kept in a single file so
 * the dashboard list, form and quick-action dropdowns stay consistent.
 */

export const PROPERTY_TYPE_LABELS: Record<
  (typeof propertyTypeValues)[number],
  string
> = {
  land: 'Terrain',
  house: 'Maison',
  apartment: 'Appartement',
  villa: 'Villa',
  studio: 'Studio',
  room: 'Chambre',
  office: 'Bureau',
  shop: 'Boutique',
  warehouse: 'Entrepôt',
  factory: 'Usine',
  farm: 'Ferme',
  hotel: 'Hôtel',
  resort: 'Resort',
  garage: 'Garage',
  parking: 'Parking',
  other: 'Autre',
};

export const CONTRACT_TYPE_LABELS: Record<
  (typeof contractTypeValues)[number],
  string
> = {
  sale: 'Vente',
  rent: 'Location',
};

export const PROPERTY_STATUS_LABELS: Record<
  (typeof propertyStatusValues)[number],
  string
> = {
  draft: 'Brouillon',
  available: 'Disponible',
  sold: 'Vendu',
  rented: 'Loué',
  under_maintenance: 'En maintenance',
  unavailable: 'Indisponible',
  pending: 'En attente',
  archived: 'Archivé',
};

export const PROPERTY_VISIBILITY_LABELS: Record<
  (typeof propertyVisibilityValues)[number],
  string
> = {
  public: 'Publié',
  private: 'Brouillon',
};

export const RENT_PERIOD_LABELS: Record<
  (typeof rentPeriodValues)[number],
  string
> = {
  daily: 'Jour',
  weekly: 'Semaine',
  monthly: 'Mois',
  yearly: 'Année',
};

export const CURRENCY_LABELS: Record<(typeof currencyValues)[number], string> = {
  XOF: 'FCFA (XOF)',
  XAF: 'FCFA (XAF)',
  EUR: 'Euro (EUR)',
  USD: 'Dollar (USD)',
};

function toOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): FormSelectOption[] {
  return values.map((v) => ({ value: v, label: labels[v] }));
}

export const PROPERTY_TYPE_OPTIONS = toOptions(
  propertyTypeValues,
  PROPERTY_TYPE_LABELS,
);
export const CONTRACT_TYPE_OPTIONS = toOptions(
  contractTypeValues,
  CONTRACT_TYPE_LABELS,
);
export const PROPERTY_STATUS_OPTIONS = toOptions(
  propertyStatusValues,
  PROPERTY_STATUS_LABELS,
);
export const PROPERTY_VISIBILITY_OPTIONS = toOptions(
  propertyVisibilityValues,
  PROPERTY_VISIBILITY_LABELS,
);
export const RENT_PERIOD_OPTIONS = toOptions(
  rentPeriodValues,
  RENT_PERIOD_LABELS,
);
export const CURRENCY_OPTIONS = toOptions(currencyValues, CURRENCY_LABELS);
