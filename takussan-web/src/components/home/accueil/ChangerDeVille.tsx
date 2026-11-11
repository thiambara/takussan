'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, MapPin } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApiQuery } from '@/hooks/useApiQuery';
import { UNE_HEURE_MS } from '@/lib/queries/referentiel-public';
import { replie } from '@/lib/queries/domaine-des-lieux';

type Domaine = { readonly data: readonly { readonly value: string; readonly count: number }[] };

/** Les villes proposées, au plus : les plus fournies du catalogue. */
export const VILLES_PROPOSEES_MAX = 12;

/**
 * TCK-2495, revue adverse — « À Dakar · Changer » : le geste qui CHANGE la ville de la rangée.
 *
 * Les villes sont celles du catalogue (`/public/properties/cities`, triées par compte), lues à la
 * première ouverture seulement. Leur compte n'est pas affiché : la ville choisie ne mène pas à une
 * liste, elle redemande les rangées de l'accueil (`near_city`), et le serveur dit lui-même s'il a dû
 * se replier sur une autre ville (`fallback`).
 */
export function ChangerDeVille({
  actuelle,
  onChoisir,
}: {
  readonly actuelle: string;
  readonly onChoisir: (ville: string) => void;
}) {
  const t = useTranslations('homepage.changerDeVille');
  const [ouvertUneFois, setOuvertUneFois] = useState(false);
  const villes = useApiQuery<Domaine>(['accueil', 'villes'], '/api/public/properties/cities', {
    enabled: ouvertUneFois,
    staleTime: UNE_HEURE_MS,
  });
  const proposees = (villes.data?.data ?? []).filter((v) => v.value && v.count > 0).slice(0, VILLES_PROPOSEES_MAX);

  return (
    <DropdownMenu onOpenChange={(ouvert) => { if (ouvert) setOuvertUneFois(true); }}>
      <DropdownMenuTrigger
        aria-label={t('label', { city: actuelle })}
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground"
      >
        <MapPin className="size-3.5" aria-hidden="true" />
        {t('bouton')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(60dvh,var(--spacing)*96)] w-56 overflow-y-auto">
        <DropdownMenuLabel>{t('titre')}</DropdownMenuLabel>
        {proposees.map((ville) => {
          const choisie = replie(ville.value) === replie(actuelle);
          return (
            <DropdownMenuItem key={ville.value} onClick={() => onChoisir(ville.value)}>
              <span className="min-w-0 flex-1 truncate">{ville.value}</span>
              {choisie ? <Check className="size-4 shrink-0 text-primary-deep" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
