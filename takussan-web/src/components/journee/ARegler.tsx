'use client';

import Link from 'next/link';
import { Inbox, NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { isReachable, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { jourADakar, joursDepuis, type Report } from '@/lib/journee/journee';
import { nomDuVisiteur } from '@/components/visits/par-le-temps/pieces';
import { decalerJour } from '@/lib/jour-de-l-api';
import type { ContactLead } from '@/lib/queries/contact-leads';
import { cn } from '@/lib/utils';
import type { AgentTask } from '@/types/agent-crm';
import type { PropertyVisit } from '@/types/visit';
import { Cocher, GESTE, GESTE_CONTOUR, GESTE_SOMBRE, ROND } from './pieces';

/** Les gestes d'une ligne : la page porte les mutations. */
export interface GestesDeLaJournee {
  readonly onCocher: (tache: { readonly id: number; readonly titre: string }, faite: boolean) => void;
  readonly onReporter: (tache: { readonly id: number; readonly titre: string }, report: Report) => void;
  readonly onContacter: (demande: ContactLead) => void;
  /** La tâche dont un geste est en cours. */
  readonly enCours: number | null;
}

/** « hier 17:00 », « aujourd'hui 09:30 », sinon « 4 nov. 17:00 ». */
function useQuand(maintenant: Date) {
  const t = useTranslations('journee.aRegler');
  const f = useFormatteurs();
  return (instant: string) => {
    const jour = jourADakar(new Date(instant));
    const aujourdhui = jourADakar(maintenant);
    const heure = f.heure(instant);
    if (jour === aujourdhui) return t('aujourdhuiA', { heure });
    if (jour === decalerJour(aujourdhui, -1)) return t('hierA', { heure });
    return t('leA', { date: f.jourMois(instant, maintenant), heure });
  };
}

function Pictogramme({ genre }: { readonly genre: 'compte-rendu' | 'demande' }) {
  const I = genre === 'demande' ? Inbox : NotebookPen;
  return (
    <span className="inline-flex size-11 flex-none items-center justify-center" aria-hidden="true">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-warning/15 text-warning">
        <I className="size-4.5" strokeWidth={1.75} />
      </span>
    </span>
  );
}

/** « Reporter » : Demain · Lundi · Dans une semaine, à 09:00 à Dakar. */
export function MenuReporter({ tache, gestes, className }: { readonly tache: { readonly id: number; readonly titre: string }; readonly gestes: GestesDeLaJournee; readonly className?: string }) {
  const t = useTranslations('journee.reporter');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('libelle', { titre: tache.titre })}
        disabled={gestes.enCours === tache.id}
        className={cn(GESTE, 'px-3 text-foreground hover:bg-foreground/5', className)}
      >
        {t('reporter')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(['demain', 'lundi', 'semaine'] as const).map((r) => (
          <DropdownMenuItem key={r} onClick={() => gestes.onReporter(tache, r)}>
            {t(r)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AReglerProps {
  readonly aClore: readonly PropertyVisit[];
  readonly demandes: readonly ContactLead[];
  readonly enRetard: readonly AgentTask[];
  readonly maintenant: Date;
  readonly gestes: GestesDeLaJournee;
  readonly className?: string;
}

/**
 * « À régler » (maquette `BlocARegler`) : les comptes rendus à faire [Faire], les demandes qui
 * attendent depuis plus de 24 h [WhatsApp], les tâches en retard [✓][Reporter] — le retard sur sa
 * propre ligne.
 */
export function ARegler({ aClore, demandes, enRetard, maintenant, gestes, className }: AReglerProps) {
  const t = useTranslations('journee.aRegler');
  const tV = useTranslations('journee');
  const f = useFormatteurs();
  const quand = useQuand(maintenant);
  const ligne = 'flex items-center gap-2.5 py-2.5 pl-2 pr-3';
  const titre = 'text-corps font-semibold leading-snug';
  const detail = 'text-sm leading-snug text-encre-douce';

  return (
    <ul data-slot="a-regler" className={cn('divide-y divide-warning/20 overflow-hidden rounded-xl border border-warning/30 bg-warning/7', className)}>
      {aClore.map((v) => {
        const nom = nomDuVisiteur(v);
        const bien = v.property?.title?.trim() || tV('bienSansTitre');
        return (
          <li key={`v-${v.id}`} className={ligne}>
            <Pictogramme genre="compte-rendu" />
            <div className="min-w-0 flex-1">
              <p className={titre}>{t('compteRendu')}</p>
              <p className={detail}>{[bien, nom].filter(Boolean).join(' · ') + (v.scheduled_at ? `, ${quand(v.scheduled_at)}` : '')}</p>
            </div>
            <Link href={`/app/visits/${v.id}`} className={cn(GESTE, GESTE_SOMBRE)}>
              {t('faire')}
            </Link>
          </li>
        );
      })}
      {demandes.map((d) => {
        const nom = d.name?.trim() || t('quelquUn');
        const n = joursDepuis(d.created_at, maintenant);
        const bien = d.property?.title?.trim();
        return (
          <li key={`d-${d.id}`} className={ligne}>
            <Pictogramme genre="demande" />
            <div className="min-w-0 flex-1">
              <p className={titre}>{t('attend', { nom, n })}</p>
              <p className={detail}>{bien ? t('demandeSur', { bien }) : t('demande')}</p>
            </div>
            {isReachable(d.phone) ? (
              <a
                href={whatsappHref(d.phone, bien ? t('messageWhatsApp', { nom, bien }) : t('messageWhatsAppSansBien', { nom }))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('whatsapp', { nom })}
                onClick={() => gestes.onContacter(d)}
                className={cn(ROND, 'bg-success text-success-foreground')}
              >
                <IconeWhatsApp className="size-4.5" />
              </a>
            ) : (
              <Link href={`/app/leads?lead=${d.id}`} className={cn(GESTE, GESTE_CONTOUR)}>
                {t('ouvrir')}
              </Link>
            )}
          </li>
        );
      })}
      {enRetard.map((tache) => {
        const cible = { id: tache.id, titre: tache.title };
        return (
          <li key={`t-${tache.id}`} className={ligne}>
            <Cocher
              faite={tache.status === 'done'}
              libelle={t('marquerFaite', { titre: tache.title })}
              disabled={gestes.enCours === tache.id}
              onClick={() => gestes.onCocher(cible, tache.status !== 'done')}
            />
            <div className="min-w-0 flex-1">
              <p className={titre}>{tache.title}</p>
              <p className={detail}>
                {tache.taskable?.label ?? null}
                {tache.due_at ? <span className="block font-medium text-destructive">{t('enRetardDepuis', { date: f.jourMois(tache.due_at, maintenant) })}</span> : null}
              </p>
            </div>
            <MenuReporter tache={cible} gestes={gestes} className="bg-transparent" />
          </li>
        );
      })}
    </ul>
  );
}
