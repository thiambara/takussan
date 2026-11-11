'use client';

import { Check, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { dateDuMois, derniersMois } from '@/lib/finances/mois';
import { cn } from '@/lib/utils';

/**
 * TCK-2659 — le mois de « Argent » : `?period=YYYY-MM`, que la synthèse reçoit tel quel et dont les
 * encaissements tirent leurs bornes. Choisir un mois efface les bornes explicites (`date_from`,
 * `date_to`) et la page : sinon le mois choisi serait sans effet, en silence.
 *
 * - `telephone` : « Novembre ▾ », pastille ronde de l'en-tête de 56 px (maquette `PeriodeMobile`) ;
 * - `bureau` : « Novembre 2026 ▾ », sélecteur de l'en-tête de page (maquette `Selecteur`).
 *
 * `mois` est `null` quand la page ne montre pas un mois (un lien d'entité, des bornes « Du / Au ») :
 * la pastille dit alors « Toutes les dates ».
 */
export interface TextesDuSelecteurDeMois {
  readonly toutes: string;
  readonly choisir: (mois: string) => string;
}

/** Les libellés du sélecteur, lus là où `admin.finances` est chargé (la page). */
export function useTextesDuSelecteurDeMois(): TextesDuSelecteurDeMois {
  const t = useTranslations('admin.finances.argent.mois');
  return { toutes: t('toutes'), choisir: (mois) => t('choisir', { mois }) };
}

export function SelecteurDeMois({
  mois,
  courant,
  variante,
  textes,
}: {
  readonly mois: string | null;
  readonly courant: string;
  readonly variante: 'telephone' | 'bureau';
  /**
   * Les libellés, traduits par la PAGE : au téléphone, le sélecteur se rend dans l'en-tête de la
   * coque (`DeclarerEnTete`), sous le fournisseur de messages de la coque, qui ne porte pas
   * `admin.finances` (`namespaces.json` découpe le dictionnaire par frontière ; le graphe d'imports
   * ne voit pas ce saut). Un `useTranslations` ici y rendrait MISSING_MESSAGE.
   */
  readonly textes: TextesDuSelecteurDeMois;
}) {
  const f = useFormatteurs();
  const router = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams();

  const nommer = (m: string, avecAnnee: boolean) => {
    const texte = f.date(dateDuMois(m), { month: 'long', ...(avecAnnee ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    return texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1);
  };

  const choisir = (m: string) => {
    const params = new URLSearchParams(recherche.toString());
    params.set('period', m);
    params.delete('date_from');
    params.delete('date_to');
    params.delete('page');
    router.replace(`${chemin}?${params.toString()}`, { scroll: false });
  };

  const libelle = mois ? nommer(mois, variante === 'bureau') : textes.toutes;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={textes.choisir(libelle)}
        className={cn(
          'inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border border-border bg-card text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring',
          variante === 'telephone' ? 'mr-1 gap-1 rounded-full pl-3 pr-2' : 'rounded-lg px-3',
        )}
      >
        {libelle}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {derniersMois(courant).map((m) => (
          <DropdownMenuItem key={m} onClick={() => choisir(m)}>
            <Check className={cn('size-4 flex-none', m === mois ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {nommer(m, true)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
