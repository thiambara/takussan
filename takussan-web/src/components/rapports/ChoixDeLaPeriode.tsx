'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { hrefDeLOnglet } from '@/lib/navigation/rapports';
import { PERIODES_DES_RAPPORTS, periodeTransmise, type PeriodeDesRapports } from '@/lib/rapports/periode';
import { cn } from '@/lib/utils';

/** L'adresse courante avec la période choisie : la portée (`scope`) et tout autre paramètre restent. */
export function adresseAvecLaPeriode(chemin: string, parametres: URLSearchParams | null, periode: PeriodeDesRapports): string {
  const suite = new URLSearchParams(parametres?.toString() ?? '');
  if (periode === 'current_month') suite.delete('period');
  else suite.set('period', periode);
  const requete = suite.toString();
  return requete ? `${chemin}?${requete}` : chemin;
}

/**
 * TCK-2791 (fiche TCK-2628, O2 et puces de période) — « Ce mois · Mois dernier » de la vue d'ensemble : le mois
 * que les tableaux de bord résument (`?period=last_month`, filtré par l'API, jamais côté navigateur). Au bureau, le
 * sélecteur « Ce mois ▾ » de la tête (maquette `TeteRapports`) ; au téléphone, la rangée de puces au-dessus de la
 * période (maquette `PeriodeTel`). « 12 mois » n'y est pas : aucune lecture ne sert ce résumé (les séries de
 * 12 mois sont déjà sous les chiffres).
 *
 * Rendu sur la vue d'ensemble SEULEMENT : les autres onglets ne lisent pas les tableaux de bord, un choix de
 * période y mentirait. La période se lit dans l'adresse côté navigateur : la tête vit dans le layout, qui ne se
 * re-rend pas quand seule la requête change.
 */
export function ChoixDeLaPeriode({ variante }: { readonly variante: 'menu' | 'puces' }) {
  const chemin = usePathname();
  if (chemin !== hrefDeLOnglet('ensemble')) return null;
  return <Choix variante={variante} chemin={chemin} />;
}

function Choix({ variante, chemin }: { readonly variante: 'menu' | 'puces'; readonly chemin: string }) {
  const t = useTranslations('rapports.periodes');
  const parametres = useSearchParams();
  const router = useRouter();
  const active = periodeTransmise(parametres?.get('period'));
  const aller = (p: PeriodeDesRapports) => router.push(adresseAvecLaPeriode(chemin, parametres, p), { scroll: false });

  if (variante === 'puces') {
    return (
      <RangeeDePuces aria-label={t('aria')} className="-mx-4 -mt-6 md:hidden" data-slot="periodes-du-rapport">
        {PERIODES_DES_RAPPORTS.map((p) => (
          <PuceDeFiltre key={p} active={p === active} onClick={() => aller(p)}>
            {t(p)}
          </PuceDeFiltre>
        ))}
      </RangeeDePuces>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('choisir', { periode: t(active) })}
        data-slot="periode-du-rapport"
        className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5')}
      >
        <CalendarRange aria-hidden="true" className="text-muted-foreground" />
        {t(active)}
        <ChevronDown aria-hidden="true" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PERIODES_DES_RAPPORTS.map((p) => (
          <DropdownMenuItem key={p} onClick={() => aller(p)} aria-current={p === active ? 'true' : undefined}>
            <Check aria-hidden="true" className={cn('size-4', p === active ? 'text-foreground' : 'invisible')} />
            {t(p)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
