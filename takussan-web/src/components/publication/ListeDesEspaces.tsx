'use client';

import { Building2, ChevronRight, Home, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { EspaceDePublication } from '@/hooks/usePublishIntent';

interface ListeDesEspacesProps {
  readonly espaces: readonly EspaceDePublication[];
  /** Le profil en cours d'ouverture : les autres boutons attendent. */
  readonly choisi: string | null;
  readonly onChoisir: (espace: EspaceDePublication) => void;
}

/**
 * « Où publier ce bien ? » — un espace par agence (`espacesDePublication`). Partagé par `/publish`
 * (TCK-625) et par la feuille de compte (TCK-2601, AC3), qui y verse l'annonce commencée sans compte.
 */
export function ListeDesEspaces({ espaces, choisi, onChoisir }: ListeDesEspacesProps) {
  const t = useTranslations('publishRedirect');
  const tTypes = useTranslations('profile.types');
  return (
    <ul className="flex flex-col gap-3">
      {espaces.map((espace) => {
        const personnel = espace.profile.agency?.kind === 'individual';
        const Icone = personnel ? Home : Building2;
        return (
          <li key={espace.agencyId}>
            <button
              type="button"
              onClick={() => onChoisir(espace)}
              disabled={choisi !== null}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
            >
              <Icone className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {personnel ? t('choose.personal') : (espace.profile.agency?.name ?? t('choose.unnamed'))}
                </span>
                <span className="block text-xs text-muted-foreground">{tTypes(espace.profile.type)}</span>
              </span>
              {choisi === espace.profile.id ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
