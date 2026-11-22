'use client';

import { useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Les filtres du bureau des Visites (maquette `app-visites-a.tsx`, `BureauListe`) : un déclencheur
 * « Libellé Valeur ▾ » et sa liste d'options. Sortis de `VisitesParLeTemps` par TCK-2882 : la vue
 * « Toutes » (`VisitsList`) porte désormais le filtre « Type ».
 */

const DECLENCHEUR = 'inline-flex h-9 flex-none items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';

export function Filtre({
  libelle,
  valeur,
  actif,
  children,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly actif: boolean;
  readonly children: (fermer: () => void) => ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger className={cn(DECLENCHEUR, actif ? 'border-primary/50 bg-secondary' : 'border-border bg-card')}>
        <span className="text-muted-foreground">{libelle}</span>
        <span className="font-medium text-foreground">{valeur}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-72 overflow-y-auto p-1">{children(() => setOuvert(false))}</PopoverContent>
    </Popover>
  );
}

export function Option({ choisie, onClick, children }: { readonly choisie: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      onClick={onClick}
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {choisie ? <Check className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  );
}

/**
 * TCK-2882 — « Liste · Semaine » (maquette `BureauListe`, mode par le temps) : le segmenté de
 * l'en-tête, au dessin de la bascule de vue de l'Agenda.
 */
export function ListeOuSemaine({ semaine, onChange }: { readonly semaine: boolean; readonly onChange: (semaine: boolean) => void }) {
  const t = useTranslations('visits.parLeTemps.affichage');
  return (
    <div role="radiogroup" aria-label={t('libelle')} className="flex w-44 rounded-xl bg-muted p-1">
      {[false, true].map((s) => (
        <button
          key={String(s)}
          type="button"
          role="radio"
          aria-checked={semaine === s}
          onClick={() => onChange(s)}
          className={cn(
            'inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring',
            semaine === s ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {s ? t('semaine') : t('liste')}
        </button>
      ))}
    </div>
  );
}
