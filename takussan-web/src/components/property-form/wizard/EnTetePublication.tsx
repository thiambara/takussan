'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import { CloudCheck, Loader2 } from 'lucide-react';

import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import { LienFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';

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
  retour,
  resume,
  apercu,
}: {
  readonly titre: string;
  readonly enregistrement: EtatEnregistrement;
  readonly action?: React.ReactNode;
  /**
   * TCK-2638 — un écran SANS parcours (le quota atteint) n'a pas « Enregistrer et quitter » : il reçoit
   * la flèche de retour de la coque (`LienFlecheDeRetour`, une seule flèche), qui mène ici. Le
   * parcours ne la reçoit jamais : sa sortie passe par l'écriture du brouillon (TCK-465).
   */
  readonly retour?: string;
  /**
   * TCK-2988 (décision 2b du porteur, 2026-11-21) — l'en-tête compact du téléphone, celui de `/publish` : sous `sm`,
   * la marque cède la place à l'intention et au résumé de l'annonce dessous ; `apercu` (l'œil) se pose avant
   * l'action. Dès `sm`, rien ne change : la marque, l'intention, et la barre d'aperçu sous l'en-tête.
   */
  readonly resume?: React.ReactNode;
  readonly apercu?: React.ReactNode;
}) {
  const t = useTranslations('property.wizard.header');
  const tCommun = useTranslations('common');
  const tCoque = useTranslations('nav.coque');

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:h-16 sm:px-8">
      {retour ? <LienFlecheDeRetour repli={retour} libelle={tCoque('retour')} className="-ml-3" /> : null}
      {resume ? (
        <>
          <div className="min-w-0 flex-1 leading-tight sm:hidden">
            <p className="truncate text-action font-semibold">{titre}</p>
            <p data-sous-titre-d-entree="" className="truncate text-ui text-muted-foreground tabular-nums">
              {resume}
            </p>
          </div>
          <span className="max-sm:hidden">
            <Logo nom={tCommun('appName')} nomVisible="des-sm" />
          </span>
        </>
      ) : (
        <Logo nom={tCommun('appName')} nomVisible="des-sm" />
      )}
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
      <span className="hidden min-w-0 truncate text-sm font-medium text-muted-foreground sm:block">
        {titre}
      </span>
      <div className={cn('ml-auto flex shrink-0 items-center gap-2 sm:gap-4', resume && 'max-sm:ml-0')}>
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-[0.8125rem]">
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
        {apercu ? <span className="-mx-1 sm:hidden">{apercu}</span> : null}
        {action}
      </div>
    </header>
  );
}
