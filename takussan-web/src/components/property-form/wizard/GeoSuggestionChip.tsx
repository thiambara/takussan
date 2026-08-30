'use client';

import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * TCK-464 — la suggestion géographique, et pourquoi elle est un BOUTON.
 *
 * La géo-IP dit où est l'utilisateur, pas où est le bien : un agent à Dakar publie une villa à
 * Saly. Poser « Dakar » dans le champ ville serait écrire à sa place — et une valeur pré-remplie
 * ne se relit pas, elle se valide. La suggestion s'accepte donc d'un geste, et ce qu'elle a
 * rempli reçoit un flash (`wizard-flash`) pour être VU, donc corrigible (AC6).
 *
 * ⚠ Deux messages, jamais une concaténation. `useGeoSuggestion` rend `region: ''` quand la géo-IP
 * connaît la ville sans la région ; un « {city}, {region} » littéral produirait « Dakar, » — une
 * virgule orpheline, dans le nom accessible d'un bouton. Le choix se fait ici parce que c'est ici
 * qu'on rend : le hook n'a pas à connaître la ponctuation d'une phrase.
 */
export function GeoSuggestionChip({
  city,
  region,
  onAccept,
  hidden,
}: {
  readonly city: string;
  readonly region: string;
  readonly onAccept: () => void;
  readonly hidden: boolean;
}) {
  const t = useTranslations('property.wizard');
  if (hidden) return null;

  return (
    <button
      type="button"
      data-testid="geo-suggestion"
      onClick={onAccept}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-dashed border-accent bg-accent/10 px-3 py-2.5 text-left text-sm text-accent transition-colors hover:bg-accent/15 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <MapPin className="shrink-0" aria-hidden="true" />
      <span>{region ? t('geoSuggestFull', { city, region }) : t('geoSuggestCity', { city })}</span>
    </button>
  );
}
