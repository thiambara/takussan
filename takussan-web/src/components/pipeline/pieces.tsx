'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NotebookPen, Phone, TriangleAlert } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { initiales } from '@/lib/fiche-publique';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { CustomerSuggestedStage, PipelineCustomerCard } from '@/types/pipeline';

import type { LectureDuProspect } from './lecture';

/**
 * TCK-2592 — les pièces partagées du pipeline (maquette `app-pipeline` a) : les gestes d'un prospect,
 * l'avatar du référent, l'alerte en rouge, le bandeau de l'étape proposée.
 */

/** Le chemin de la fiche complète : la feuille latérale sans lien ni sélecteur d'étape a disparu. */
export const cheminDeLaFiche = (id: number) => `/app/customers/${id}`;

const GESTE = 'inline-flex flex-none items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring';

interface GestesProps {
  readonly prospect: PipelineCustomerCard;
  readonly lecture: LectureDuProspect;
  /** `rond` : 44 px (téléphone) ; `carte` : 28 px ronds (kanban) ; `ligne` : 28 px carrés (liste du bureau). */
  readonly forme: 'rond' | 'carte' | 'ligne';
  /** Le personnel : le geste est enregistré (`POST …/contacts`) ; le bailleur appelle sans trace. */
  readonly noter?: (channel: CanalDeContactClient) => void;
}

/**
 * Appeler, puis WhatsApp — ou « Compte rendu » quand c'est lui qui manque (il mène à la fiche, où la
 * visite à clore se lit). Un numéro joignable seulement (`isReachable`) pour les deux premiers.
 */
export function GestesDuProspect({ prospect, lecture, forme, noter }: GestesProps) {
  const t = useTranslations('agentCrm.contact');
  const tP = useTranslations('crm.pipeline');
  const phone = prospect.phone;
  const joignable = isReachable(phone);
  const taille = forme === 'rond' ? 'size-11' : 'size-7';
  const rayon = forme === 'ligne' ? 'rounded-md' : 'rounded-full';
  const icone = forme === 'rond' ? 'size-icone' : 'size-3.5';

  const compteRendu = lecture.compteRendu ? (
    forme === 'ligne' ? (
      <Link
        href={cheminDeLaFiche(prospect.id)}
        aria-label={tP('compteRendu.aria', { name: lecture.nom })}
        data-slot="geste-compte-rendu"
        className={cn(GESTE, 'h-7 gap-1.5 whitespace-nowrap rounded-md bg-secondary px-2 text-xs font-semibold text-primary-deep hover:bg-secondary/80')}
      >
        <NotebookPen className="size-3.5" aria-hidden="true" />
        {tP('compteRendu.libelle')}
      </Link>
    ) : (
      <Link
        href={cheminDeLaFiche(prospect.id)}
        aria-label={tP('compteRendu.aria', { name: lecture.nom })}
        data-slot="geste-compte-rendu"
        className={cn(GESTE, taille, rayon, 'bg-secondary text-primary-deep hover:bg-secondary/80')}
      >
        <NotebookPen className={icone} aria-hidden="true" />
      </Link>
    )
  ) : null;

  // Liste du bureau : le compte rendu manquant prend la place des deux gestes (maquette a-0).
  if (forme === 'ligne' && compteRendu) return compteRendu;

  return (
    <>
      {joignable ? (
        <a
          href={telHref(phone)}
          onClick={() => noter?.('call')}
          aria-label={t('callAria', { name: lecture.nom })}
          data-slot="geste-appeler"
          className={cn(GESTE, taille, rayon, 'border border-border bg-card text-foreground hover:bg-muted')}
        >
          <Phone className={icone} strokeWidth={1.75} aria-hidden="true" />
        </a>
      ) : null}
      {compteRendu ??
        (joignable ? (
          <a
            href={whatsappHref(phone, t('whatsappMessage', { firstName: lecture.prenom }))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => noter?.('whatsapp')}
            aria-label={t('whatsappAria', { name: lecture.nom })}
            data-slot="geste-whatsapp"
            className={cn(
              GESTE,
              taille,
              rayon,
              // Téléphone : la teinte douce de la maquette ; bureau : le vert plein.
              forme === 'rond' ? 'bg-success/12 text-success hover:bg-success/20' : 'bg-success text-success-foreground hover:bg-success/90',
            )}
          >
            <IconeWhatsApp className={forme === 'rond' ? 'size-5' : 'size-3.5'} />
          </a>
        ) : null)}
    </>
  );
}

/** Les initiales du référent, en pastille (le nom au lecteur d'écran et au survol). */
export function ReferentDuProspect({ nom, taille }: { readonly nom: string; readonly taille: 22 | 24 }) {
  const t = useTranslations('crm.pipeline.liste');
  return (
    <span
      title={nom}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar font-semibold text-accent',
        taille === 22 ? 'size-[calc(var(--spacing)*5.5)] text-pastille' : 'size-6 text-pastille',
      )}
    >
      <span aria-hidden="true">{initiales(nom)}</span>
      <span className="sr-only">{t('referentAria', { name: nom })}</span>
    </span>
  );
}

/** Une relance due, en rouge, son icône d'alerte en tête. */
export function AlerteDuProspect({ children, className }: { readonly children: string; readonly className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 font-medium text-destructive', className)}>
      <TriangleAlert className="size-3.5 flex-none" aria-hidden="true" />
      <span className="truncate first-letter:uppercase">{children}</span>
    </span>
  );
}

interface SuggestionProps {
  readonly suggestion: CustomerSuggestedStage;
  readonly prenom: string;
  readonly onOui: (to: CustomerPipelineStage) => void;
  readonly onPlusTard: () => void;
  readonly enCours?: boolean;
  readonly className?: string;
}

/** « Bineta a visité : la passer en Qualifié ? [Oui] [Plus tard] » (TCK-2591). */
export function BandeauSuggestion({ suggestion, prenom, onOui, onPlusTard, enCours, className }: SuggestionProps) {
  const t = useTranslations('crm.pipeline');
  const tStage = useTranslations('crm.pipeline.stage');
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      data-slot="suggestion-etape"
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-secondary px-2 py-1.5 text-xs text-primary-deep', className)}
      onPointerDown={stop}
    >
      <span className="min-w-0 flex-1 font-medium">{t(`suggestion.${suggestion.reason}`, { prenom, stage: tStage(suggestion.to) })}</span>
      <span className="flex gap-1">
        <button type="button" disabled={enCours} onClick={() => onOui(suggestion.to)} className="h-6 rounded bg-primary px-2 font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60">
          {t('suggestion.oui')}
        </button>
        <button type="button" disabled={enCours} onClick={onPlusTard} className="h-6 rounded px-2 font-medium outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60">
          {t('suggestion.plusTard')}
        </button>
      </span>
    </div>
  );
}
