'use client';

import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ModerationReview } from '@/lib/queries/reviews-moderation';
import type { ReviewStatus } from '@/lib/queries/reviews';
import { lireTable } from '@/lib/table-de-statut';
import { cn } from '@/lib/utils';

import { EtoilesDeLAvis, PuceDeRisque, VignetteDuSujet } from './pieces-de-l-avis';

/** TCK-373 — le ton du statut, hors « en attente » (la file du jour ne le répète pas sur chaque carte). */
const TONS_DU_STATUT: Record<Exclude<ReviewStatus, 'pending'>, StatusTone> = {
  reported: 'danger',
  approved: 'success',
  rejected: 'neutral',
};

interface CarteDAvisProps {
  readonly avis: ModerationReview;
  /** L'avis ouvert dans le détail (bureau). */
  readonly actif?: boolean;
  /** `undefined` : pas de case (« À risque », ou un avis qui ne se publie pas par lot). */
  readonly coche?: boolean;
  readonly onCocher?: (coche: boolean) => void;
  readonly onOuvrir: () => void;
}

/**
 * TCK-2673 — la carte compacte d'un avis dans la file (maquette `CarteAvis`) : le SUJET en titre (photo
 * du bien ou initiales de l'agent), les étoiles, l'auteur et la date, le début du texte, la raison du
 * risque. La case (lot) est une cible de 44 px à part : une case dans un bouton n'est pas un contrôle.
 */
export function CarteDAvis({ avis, actif = false, coche, onCocher, onOuvrir }: CarteDAvisProps) {
  const t = useTranslations('admin.moderation');
  const tFile = useTranslations('admin.moderation.file');
  const { jourMois } = useFormatteurs();
  const auteur = avis.author?.name ?? t('detail.anonymous');
  const avecCase = coche !== undefined && onCocher !== undefined;

  return (
    <li
      data-testid={`moderation-queue-item-${avis.id}`}
      className={cn('flex gap-3 px-4 py-3', actif ? 'bg-secondary/70' : coche ? 'bg-secondary/40' : undefined)}
    >
      {avecCase ? (
        <label className="-m-2 inline-flex size-11 flex-none cursor-pointer items-start justify-center p-2.5">
          <Checkbox checked={coche} onCheckedChange={(v) => onCocher(Boolean(v))} aria-label={tFile('cocherAria', { auteur })} />
        </label>
      ) : null}
      <button
        type="button"
        onClick={onOuvrir}
        aria-current={actif ? 'true' : undefined}
        className="flex min-w-0 flex-1 gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <VignetteDuSujet sujet={avis.target} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-corps font-semibold leading-tight">{avis.target?.title ?? avis.title ?? t('emptyReview')}</span>
          <span className="mt-1 flex items-center gap-2 text-ui text-muted-foreground">
            <EtoilesDeLAvis note={avis.rating} />
            <span className="truncate">
              {auteur} · {jourMois(avis.created_at)}
            </span>
          </span>
          {avis.content ? <span className="mt-1 line-clamp-2 text-sm leading-snug">{avis.content}</span> : null}
          {avis.status && avis.status !== 'pending' ? (
            <span className="mt-1.5 block">
              <StatusBadge
                tone={lireTable(TONS_DU_STATUT, avis.status) ?? 'neutral'}
                label={lireTable(TONS_DU_STATUT, avis.status) ? t(`status.${avis.status as keyof typeof TONS_DU_STATUT}`) : avis.status}
              />
            </span>
          ) : null}
          {avis.risk?.level === 'high' || (avis.reported_count ?? 0) > 0 ? (
            <span className="mt-1.5 block">
              <PuceDeRisque avis={avis} />
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
