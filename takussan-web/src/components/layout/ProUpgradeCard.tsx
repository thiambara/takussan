'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * TCK-633 — l'habillage de la carte, quand elle vit sur un autre fond que la barre claire de `/app`.
 *
 * Décision 1 du porteur : la carte « Passer en agence » remplace, dans la barre SOMBRE de « Mon
 * espace » (`AdminSidebar`), les cadenas de TCK-371. Elle doit y parler le vocabulaire de CETTE
 * barre et y porter un anneau de focus mesurable sur ses fonds — l'anneau `--ring` et le fond
 * `bg-muted` de l'habillage clair y tombent sous les 3:1 de WCAG 1.4.11.
 *
 * Les classes sont fournies PAR la barre qui monte la carte, et non écrites ici : ce fichier est
 * rendu par `/app`, dont `scripts/check-super-admin-tokens.mjs` plafonne les couleurs brutes
 * (`white`…) ; la barre sombre, elle, les emploie déjà toutes.
 */
export interface ApparenceProUpgradeCard {
  /** Le lien entier : bordure, fonds (repos et survol) et anneau de focus. */
  readonly carte: string;
  /** La pastille de l'icône. */
  readonly pastille: string;
  readonly titre: string;
  readonly corps: string;
  /** La ligne d'appel (« En savoir plus »). */
  readonly appel: string;
}

interface ProUpgradeCardProps {
  readonly pending?: boolean;
  readonly onNavigate?: () => void;
  /** Absent : l'habillage clair de la barre `/app` (TCK-267), inchangé. */
  readonly apparence?: ApparenceProUpgradeCard;
}

const UPGRADE_HREF = '/app/settings/agency/upgrade';

export function ProUpgradeCard({ pending = false, onNavigate, apparence }: ProUpgradeCardProps) {
  const t = useTranslations('nav.proUpgrade');
  const Icon = pending ? Clock3 : Sparkles;
  const title = pending ? t('pendingTitle') : t('title');
  const body = pending ? t('pendingBody') : t('body');
  const cta = pending ? t('pendingCta') : t('cta');

  return (
    <Link
      href={UPGRADE_HREF}
      onClick={onNavigate}
      aria-label={title}
      className={cn(
        'group/upgrade mb-2 block rounded-xl border px-3.5 py-3 transition-colors',
        apparence
          ? apparence.carte
          : pending
            ? 'border-border bg-muted/70 hover:bg-muted'
            : 'border-border bg-muted hover:border-primary/30 hover:bg-border',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            apparence
              ? apparence.pastille
              : pending
                ? 'bg-card text-muted-foreground'
                : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[0.8rem] font-semibold leading-tight',
              apparence ? apparence.titre : 'text-foreground',
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs leading-snug text-pretty',
              apparence ? apparence.corps : 'text-muted-foreground',
            )}
          >
            {body}
          </p>
          <p
            className={cn(
              'mt-2 inline-flex items-center text-[11px] font-semibold uppercase tracking-wide',
              apparence
                ? apparence.appel
                : pending
                  ? 'text-muted-foreground group-hover/upgrade:text-foreground'
                  : 'text-primary group-hover/upgrade:text-foreground',
            )}
          >
            {cta}
            <ArrowRight
              aria-hidden
              className="ml-1 size-3 transition-transform group-hover/upgrade:translate-x-0.5"
            />
          </p>
        </div>
      </div>
    </Link>
  );
}
