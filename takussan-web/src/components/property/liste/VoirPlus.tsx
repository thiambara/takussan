'use client';

import type { MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface VoirPlusProps {
  /** Le nombre de biens de la recherche (`meta.total`). */
  readonly total: number;
  /** Le rang du dernier bien affiché (pages précédant la première comprises). */
  readonly affiches: number;
  /** Combien la page suivante en apporte au plus (`meta.per_page`). */
  readonly parPage: number;
  /** Le lien de la page suivante — pour un robot et un clic modifié. `null` : rien après. */
  readonly href: string | null;
  readonly chargement: boolean;
  readonly erreur: boolean;
  readonly onVoirPlus: () => void;
  readonly className?: string;
}

/** Un clic que le navigateur doit garder : nouvel onglet, nouvelle fenêtre. */
function clicModifie(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/**
 * TCK-2499 — « Voir N biens de plus » remplace la pagination numérotée : on continue sa lecture au
 * lieu de changer de page. Le compte dit où l'on en est (« 40 sur 172 biens »), le bouton combien
 * de biens il ajoute — jamais plus que ce qui reste.
 *
 * C'est un LIEN vers la page suivante (`href`), intercepté au clic simple : la page reste
 * atteignable par un robot et par un clic modifié (TCK-557).
 */
export function VoirPlus({
  total,
  affiches,
  parPage,
  href,
  chargement,
  erreur,
  onVoirPlus,
  className,
}: VoirPlusProps) {
  const t = useTranslations('search.results.voirPlus');
  const vus = Math.min(affiches, total);
  const restant = Math.max(0, total - vus);
  const suivants = Math.min(parPage, restant);
  if (total <= 0) return null;

  return (
    <div data-voir-plus className={cn('mx-auto max-w-sm pt-8 text-center', className)}>
      <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
        {t('compte', { vus, total })}
      </p>
      {href && suivants > 0 ? (
        <a
          href={href}
          aria-busy={chargement || undefined}
          onClick={(e) => {
            if (e.defaultPrevented || clicModifie(e)) return;
            e.preventDefault();
            if (!chargement) onVoirPlus();
          }}
          className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-foreground bg-card text-[15px] font-semibold text-foreground transition-[background-color,scale] duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          {chargement ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t('bouton', { count: suivants })}
        </a>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t('erreur')}
        </p>
      ) : null}
    </div>
  );
}
