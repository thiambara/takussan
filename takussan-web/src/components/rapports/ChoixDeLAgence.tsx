'use client';

import { Building2, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EspacesDuMenu } from '@/components/profile/EspacesDuMenu';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useMyProfiles } from '@/hooks/useProfiles';
import { espacesAProposer } from '@/lib/espaces';
import { cn } from '@/lib/utils';

/**
 * TCK-2867 (maquette `app-rapports` e0, « Agence ▾ ») — la portée de l'admin : le nom de l'espace actif. Avec un
 * autre espace, il ouvre LE choix d'espace de la coque (`EspacesDuMenu` : même lecture `/api/me/profiles`, même
 * bascule `PATCH /api/me/active-profile`, qui rafraîchit le routeur — les rapports se relisent sous l'espace choisi).
 * Une agence seule : le nom, sans menu (l'audit, écart 9 : « l'agence se choisit dans la coque »).
 *
 * Au bureau dans la tête de « Rapports » (`variante="tete"`), au téléphone sur la ligne de la période (`"ligne"`).
 */
export function ChoixDeLAgence({ nom, variante }: { readonly nom: string; readonly variante: 'tete' | 'ligne' }) {
  const t = useTranslations('rapports');
  const profils = useMyProfiles();
  const espaces = espacesAProposer(profils.data?.data ?? [], profils.data?.meta.active_profile_id ?? null);
  const classes = cn(
    'inline-flex h-9 max-w-full flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium',
    // Au téléphone, à côté de la période : la puce cède la place (le nom se tronque), jamais la période.
    variante === 'ligne' && 'min-w-0 max-w-[45%] shrink rounded-full',
  );

  if (espaces.length <= 1) {
    return (
      <span data-slot="choix-de-l-agence" className={cn(classes, variante === 'tete' && 'max-md:hidden', variante === 'ligne' && 'md:hidden')}>
        <Building2 className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">{nom}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="choix-de-l-agence"
        aria-label={t('choisirLAgence', { nom })}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'max-w-full gap-1.5',
          variante === 'ligne' && 'min-w-0 max-w-[45%] shrink rounded-full',
          variante === 'tete' && 'max-md:hidden',
          variante === 'ligne' && 'md:hidden',
        )}
      >
        <Building2 className="flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">{nom}</span>
        <ChevronDown className="flex-none text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      {/* `EspacesDuMenu` se clôt par un séparateur (il précède le reste du menu du compte) : ici, rien ne le suit. */}
      <DropdownMenuContent align="end" className="w-80 [&_[role=separator]:last-child]:hidden">
        <EspacesDuMenu titre={t('espaces')} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
