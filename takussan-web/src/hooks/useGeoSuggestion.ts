'use client';

import { useUserLocation } from '@/components/providers/UserLocationProvider';
import { currencyValues } from '@/lib/schemas/property';

/**
 * TCK-464 — dérive de la géo-IP deux choses de FORCE DIFFÉRENTE, et refuse de les confondre.
 *
 * `defaults` : ce qui est quasi toujours juste — pays, devise, centre de carte. Posé d'office.
 * `suggestion` : ce qui peut être faux — ville et région. Un agent à Dakar publie une villa à
 * Saly ; la géo-IP dit alors « Dakar », et une valeur pré-remplie ne se relit pas, elle se
 * valide. La suggestion doit donc être ACCEPTÉE, jamais posée.
 *
 * Aucun appel réseau : `UserLocationProvider` est monté site-wide et met la réponse ipapi en
 * cache 24 h dans localStorage.
 */
export type GeoSuggestion = { readonly city: string; readonly region: string } | null;

export type GeoDefaults = {
  country?: string;
  currency?: (typeof currencyValues)[number];
  lat?: number;
  lng?: number;
};

function deviseSupportee(brut: string | undefined): GeoDefaults['currency'] {
  if (!brut) return undefined;
  const majuscule = brut.trim().toUpperCase();
  return (currencyValues as readonly string[]).includes(majuscule)
    ? (majuscule as GeoDefaults['currency'])
    : undefined;
}

export function useGeoSuggestion(): {
  suggestion: GeoSuggestion;
  defaults: GeoDefaults;
  loading: boolean;
} {
  const { location, loading } = useUserLocation();

  if (!location) return { suggestion: null, defaults: {}, loading };

  const ville = location.city?.trim() ?? '';
  const region = location.region?.trim() ?? '';
  const pays = location.country_code?.trim().toUpperCase();

  const defaults: GeoDefaults = {};
  if (pays && pays.length === 2) defaults.country = pays;
  const devise = deviseSupportee(location.currency);
  if (devise) defaults.currency = devise;
  if (typeof location.latitude === 'number') defaults.lat = location.latitude;
  if (typeof location.longitude === 'number') defaults.lng = location.longitude;

  return {
    // Sans ville, il n'y a rien à suggérer : une région seule ne remplit aucun champ obligatoire.
    suggestion: ville ? { city: ville, region } : null,
    defaults,
    loading,
  };
}
