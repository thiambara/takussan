'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Cocher } from '@/components/journee/pieces';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Report } from '@/lib/journee/journee';
import type { TacheDeLaPage } from '@/lib/queries/taches';
import { estFaite } from '@/lib/taches/taches';
import { cn } from '@/lib/utils';
import { useEcheanceEnClair } from './LigneDeTache';

const REPORTS: readonly Report[] = ['demain', 'lundi', 'semaine'];

const LIEN_D_ACTION = 'inline-flex h-11 items-center gap-1 rounded-md px-1.5 text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50';

interface TableauDeTachesProps {
  readonly taches: readonly TacheDeLaPage[];
  readonly maintenant: Date;
  /** La ligne n'est pas modifiable (ni assigné ni créateur) ou un geste est en vol. */
  readonly bloquee: (tache: TacheDeLaPage) => boolean;
  /** Les gestes sont offerts à l'assigné et au créateur (`TaskPolicy::update`). */
  readonly modifiable: (tache: TacheDeLaPage) => boolean;
  readonly onCocher: (tache: TacheDeLaPage) => void;
  readonly onOuvrir: (tache: TacheDeLaPage) => void;
  readonly onReporter: (tache: TacheDeLaPage, report: Report) => void;
  /** « Choisir… » : la fiche, où vit le calendrier. */
  readonly onChoisirLaDate: (tache: TacheDeLaPage) => void;
  readonly onModifier: (tache: TacheDeLaPage) => void;
}

/**
 * TCK-2857 — « Plus tard » au bureau (maquette `app-aujourdhui` e1, l. 739-752) : un tableau — la
 * coche, le titre, le rattachement, l'échéance — et, par ligne, « Reporter · Modifier » en ligne.
 * « Reporter » propose Demain · Lundi · Dans une semaine · Choisir…, comme la fiche ; « Modifier »
 * ouvre la fiche, le titre en édition. Le tableau défile dans son conteneur (AC-F3).
 */
export function TableauDeTaches({ taches, maintenant, bloquee, modifiable, onCocher, onOuvrir, onReporter, onChoisirLaDate, onModifier }: TableauDeTachesProps) {
  const t = useTranslations('taches');
  const echeanceEnClair = useEcheanceEnClair();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card" data-slot="tableau-de-taches">
      <table className="w-full min-w-xl border-collapse text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col" />
            <th scope="col">{t('tableau.titre')}</th>
            <th scope="col">{t('tableau.rattachement')}</th>
            <th scope="col">{t('tableau.echeance')}</th>
            <th scope="col">{t('tableau.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {taches.map((tache) => {
            const faite = estFaite(tache);
            const { texte, retard } = echeanceEnClair(tache, maintenant);
            const cible = tache.taskable;
            const gestes = modifiable(tache);
            return (
              <tr key={tache.id} data-tache={tache.id} className="border-b border-border last:border-0">
                <td className="w-12 pl-1">
                  <Cocher faite={faite} disabled={bloquee(tache)} libelle={t(faite ? 'ligne.rouvrir' : 'ligne.cocher', { titre: tache.title })} onClick={() => onCocher(tache)} />
                </td>
                <td className="py-2 font-medium">
                  <button type="button" onClick={() => onOuvrir(tache)} className={cn('rounded-md text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring', faite && 'text-muted-foreground line-through')}>
                    {tache.title}
                  </button>
                </td>
                <td className="px-3 text-muted-foreground">{cible ? (cible.label ?? t(`ligne.cache.${cible.type}`)) : null}</td>
                <td className={cn('whitespace-nowrap px-3 tabular-nums', retard && !faite ? 'text-destructive' : 'text-muted-foreground')}>{texte}</td>
                <td className="w-55 whitespace-nowrap pr-4 text-right">
                  {gestes ? (
                    <span className="inline-flex items-center">
                      {faite ? null : (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger aria-label={t('tableau.reporterAria', { titre: tache.title })} disabled={bloquee(tache)} className={LIEN_D_ACTION}>
                              {t('tableau.reporter')}
                              <ChevronDown className="size-3.5" aria-hidden="true" />
                            </DropdownMenuTrigger>
                            {/* `onClick`, jamais `onSelect` : base-ui n'a pas de `onSelect` (cf. PropertyHeaderActions). */}
                            <DropdownMenuContent align="end">
                              {REPORTS.map((r) => (
                                <DropdownMenuItem key={r} onClick={() => onReporter(tache, r)}>
                                  {t(`fiche.report.${r}`)}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem onClick={() => onChoisirLaDate(tache)}>{t('fiche.report.choisir')}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span aria-hidden="true" className="text-muted-foreground">
                            ·
                          </span>
                        </>
                      )}
                      <button type="button" aria-label={t('tableau.modifierAria', { titre: tache.title })} onClick={() => onModifier(tache)} className={LIEN_D_ACTION}>
                        {t('tableau.modifier')}
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
