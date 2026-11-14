'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import type { LectureDuProspect } from '../lecture';
import { AlerteDuProspect, BandeauSuggestion, GestesDuProspect, ReferentDuProspect, cheminDeLaFiche } from '../pieces';

interface CarteProps {
  readonly prospect: PipelineCustomerCard;
  readonly lecture: LectureDuProspect;
  readonly noter?: (channel: CanalDeContactClient) => void;
  /** « Oui » sur l'étape proposée : le même chemin que le dépôt (une sortie demande son motif). */
  readonly onEtape?: (prospect: PipelineCustomerCard, to: CustomerPipelineStage) => void;
  readonly onPlusTard?: (prospect: PipelineCustomerCard) => void;
  /** L'aperçu qui suit le pointeur (`DragOverlay`) : penché, sans gestes actifs. */
  readonly apercu?: boolean;
}

/**
 * TCK-2592 — la carte du kanban (maquette `app-pipeline` a-1, bureau) : poignée, nom, référent, ce
 * qu'il cherche, le dernier contact, la prochaine action (en rouge quand une relance est due), Appeler
 * et WhatsApp, et « Fiche ». Elle se glisse au pointeur, de n'importe où, et au clavier par sa poignée
 * (un vrai bouton : Espace la saisit, ← → la portent d'une colonne à l'autre, Espace la repose, Échap
 * annule) ; « Fiche » ouvre la fiche complète. La carte elle-même n'est pas un bouton : elle porte des
 * liens et des gestes, qu'un rôle `button` englobant rendrait muets aux lecteurs d'écran.
 */
export function CarteDuPipeline({ prospect, lecture, noter, onEtape, onPlusTard, apercu }: CarteProps) {
  const t = useTranslations('crm.pipeline.carte');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: prospect.id, data: { prospect }, disabled: apercu });
  const style: CSSProperties = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {};
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={apercu ? undefined : setNodeRef}
      onPointerDown={apercu ? undefined : (e) => listeners?.onPointerDown?.(e)}
      style={style}
      data-slot="carte-pipeline"
      data-customer-id={prospect.id}
      className={cn(
        // `transition-[…]` et non `transition` : dnd-kit écrit `transform` à chaque mouvement du pointeur.
        'cursor-grab rounded-lg border bg-card p-2.5 text-sm leading-snug transition-[border-color,box-shadow] duration-150 active:cursor-grabbing',
        apercu ? 'translate-x-4 rotate-2 border-primary shadow-xl' : 'border-border shadow-filet hover:border-primary/40',
        isDragging && !apercu && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1">
        {apercu ? (
          <GripVertical className="-ml-1 size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
        ) : (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            onKeyDown={(e) => listeners?.onKeyDown?.(e)}
            aria-label={t('saisir', { name: lecture.nom })}
            data-slot="poignee"
            className="-my-1 -ml-2 -mr-1 flex-none cursor-grab rounded p-1 text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <GripVertical className="size-3.5" aria-hidden="true" />
          </button>
        )}
        <p className="min-w-0 flex-1 truncate font-semibold">{lecture.nom}</p>
        {prospect.referent ? <ReferentDuProspect nom={prospect.referent.name} taille={22} /> : null}
      </div>
      {/* Sous 1440 (colonnes de moins de 220 px), la recherche passe sur deux lignes plutôt que d'être coupée. */}
      {lecture.cherche ? <p className="mt-1 line-clamp-2 whitespace-normal text-encre-douce w1440:block w1440:truncate">{lecture.cherche}</p> : null}
      <p className="truncate text-muted-foreground first-letter:uppercase">{lecture.dernier}</p>
      {lecture.alerte ? (
        <AlerteDuProspect className="mt-0.5">{lecture.prochaine?.enRetard ? lecture.prochaine.texte : lecture.alerte}</AlerteDuProspect>
      ) : lecture.prochaine ? (
        <p className="mt-0.5 truncate text-encre-douce">{lecture.prochaine.texte}</p>
      ) : null}
      {prospect.suggested_stage && onEtape && onPlusTard && !apercu ? (
        <BandeauSuggestion
          className="mt-2"
          suggestion={prospect.suggested_stage}
          prenom={lecture.prenom}
          onOui={(to) => onEtape(prospect, to)}
          onPlusTard={() => onPlusTard(prospect)}
        />
      ) : null}
      {/* Les gestes ne saisissent pas la carte : `pointerdown` arrêté, sinon le capteur y voit un glisser. */}
      <div className="mt-2 flex items-center gap-1.5" onPointerDown={stop}>
        <GestesDuProspect prospect={prospect} lecture={lecture} forme="carte" noter={noter} />
        <Link
          href={cheminDeLaFiche(prospect.id)}
          aria-label={t('ficheAria', { name: lecture.nom })}
          tabIndex={apercu ? -1 : undefined}
          className="ml-auto rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('fiche')}
        </Link>
      </div>
    </div>
  );
}
