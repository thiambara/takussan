'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import { CloudCheck, Loader2 } from 'lucide-react';

import { Logo } from '@/components/brand/Logo';

/**
 * TCK-631 — l'en-tête du parcours plein écran : la marque, ce qu'on est en train de faire, l'état
 * du brouillon, la sortie.
 *
 * ⚠ La marque n'est PAS un lien. La barre de la console a disparu de cette route, et un logo
 * cliquable y serait la seule sortie qui ne passe pas par « Enregistrer et quitter » — c'est-à-dire
 * par l'écriture du brouillon (TCK-465).
 *
 * L'état du brouillon est une région `status` : l'autosave est silencieux, cette ligne est le seul
 * endroit où il se voit. Rien avant la première écriture — « enregistré » ne se dit qu'une fois vrai.
 */
export type EtatEnregistrement = 'aucun' | 'en-cours' | 'enregistre';

export function EnTetePublication({
  titre,
  enregistrement,
  action,
}: {
  readonly titre: string;
  readonly enregistrement: EtatEnregistrement;
  readonly action?: React.ReactNode;
}) {
  const t = useTranslations('property.wizard.header');
  const tCommun = useTranslations('common');

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:h-16 sm:px-8">
      <Logo nom={tCommun('appName')} nomVisible="des-sm" />
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
      <span className="hidden min-w-0 truncate text-sm font-medium text-muted-foreground sm:block">
        {titre}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-[13px]">
          {enregistrement === 'en-cours' ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="max-sm:sr-only">{t('draftSaving')}</span>
            </>
          ) : enregistrement === 'enregistre' ? (
            <>
              <CloudCheck className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t('draftSaved')}</span>
            </>
          ) : null}
        </p>
        {action}
      </div>
    </header>
  );
}
