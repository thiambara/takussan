/**
 * TCK-164 — short address formatter for property cards, banners and the
 * `/properties/[slug]` location strip. The backend's `Address.full`
 * accessor cheerfully concatenates every column it has, which produces
 * eyesores like `Amitié, Dakar, Dakar, SN` (quartier, ville, région
 * = ville, code pays). This helper trims that down to `Quartier, Ville`.
 */
export interface AddressParts {
  readonly quarter?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string | null;
}

export interface FormatAddressOptions {
  readonly withRegion?: boolean;
  readonly withCountry?: boolean;
  readonly fallback?: string;
}

function normalize(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Compose an address as `Quartier, Ville` by default. The region is added
 * with `withRegion: true` only when it differs from the city; the country
 * code is opt-in via `withCountry`. Returns `fallback` (default empty
 * string) when no usable parts are available.
 *
 * @example
 *   formatAddressShort({ quarter: 'Amitié', city: 'Dakar', region: 'Dakar' })
 *   // → "Amitié, Dakar"
 *   formatAddressShort({ quarter: 'Sébikotane', city: 'Rufisque', region: 'Dakar' }, { withRegion: true })
 *   // → "Sébikotane, Rufisque, Dakar"
 *   formatAddressShort({ city: 'Saint-Louis' }, { withCountry: true })
 *   // → "Saint-Louis, SN"
 */
export function formatAddressShort(
  address: AddressParts | null | undefined,
  options: FormatAddressOptions = {},
): string {
  const fallback = options.fallback ?? '';
  if (!address) return fallback;

  const quarter = normalize(address.quarter);
  const city = normalize(address.city);
  const region = normalize(address.region);
  const country = normalize(address.country);

  const parts: string[] = [];
  if (quarter) parts.push(quarter);
  if (city) parts.push(city);

  if (options.withRegion && region) {
    const cityLower = city?.toLowerCase();
    if (cityLower !== region.toLowerCase()) parts.push(region);
  }

  if (options.withCountry && country) {
    parts.push(country);
  }

  return parts.length > 0 ? parts.join(', ') : fallback;
}
