'use client';

import { Sparkles } from 'lucide-react';
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
      // TCK-2819 (lot 2) — maquette a-1 : une pastille `primary`, à sa largeur, l'étincelle d'une proposition.
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/35 bg-primary/7 px-4 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Sparkles className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{region ? t('geoSuggestFull', { city, region }) : t('geoSuggestCity', { city })}</span>
    </button>
  );
}
