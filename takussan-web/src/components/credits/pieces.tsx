'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Image as ImageIcon, Plus } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { cn } from '@/lib/utils';

/**
 * TCK-2664 — les pièces de la page Crédits (maquette `app-credits`, approche A) : la carte et son
 * en-tête, l'intertitre du téléphone, la vignette d'un bien, le delta de crédits, « Recharger ».
 */

/** La carte de la zone de contenu ; avec `titre`, son en-tête (titre à gauche, action à droite). */
export function Carte({
  titre,
  action,
  children,
  className,
  'aria-labelledby': etiquette,
}: {
  readonly titre?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'aria-labelledby'?: string;
}) {
  return (
    <section aria-labelledby={etiquette} className={cn('rounded-xl border border-border bg-card', className)}>
      {titre ? (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 id={etiquette} className="min-w-0 flex-1 truncate text-corps font-semibold">
            {titre}
          </h2>
          {action ? <span className="flex-none text-sm font-medium text-primary">{action}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** L'intertitre d'une page de téléphone : petites capitales. */
export function Rubrique({ id, children, className }: { readonly id?: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1 pb-2', className)}>
      <h2 id={id} className="text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">
        {children}
      </h2>
    </div>
  );
}

const TAILLES = { 40: 'size-10', 44: 'size-11', 48: 'size-12', 56: 'size-14' } as const;

/** La photo d'un bien, carrée ; un pictogramme quand il n'en a pas. */
export function Vignette({ src, taille }: { readonly src: string | null | undefined; readonly taille: keyof typeof TAILLES }) {
  return (
    <span
      data-slot="vignette-du-bien"
      className={cn('relative inline-flex flex-none items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground', TAILLES[taille])}
    >
      {src ? <Image src={src} alt="" fill sizes={`${taille}px`} className="object-cover" /> : <ImageIcon className="size-5" aria-hidden="true" />}
    </span>
  );
}

/** « +100 » en vert, « −20 » à l'encre : le signe moins typographique, jamais le trait d'union. */
export function signe(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

export function Delta({ n, className }: { readonly n: number; readonly className?: string }) {
  return (
    <span data-slot="delta-de-credits" className={cn('font-semibold tabular-nums', n > 0 ? 'text-success' : 'text-foreground', className)}>
      {signe(n)}
    </span>
  );
}

/**
 * « Recharger · Bientôt » : PAS une action (l'achat est la phase 2 d'ADR-0061). Décision 14 : quand
 * l'achat existera, son prix en F CFA s'affichera ici ; aujourd'hui aucun prix n'est inventé.
 */
export function Recharger({ className }: { readonly className?: string }) {
  const t = useTranslations('credits.page');
  return (
    // Un vrai bouton, atteignable au clavier, qui dit qu'il est indisponible et ne fait rien.
    <button
      type="button"
      aria-disabled="true"
      data-slot="recharger"
      className={cn(
        'inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 text-corps font-medium text-muted-foreground',
        className,
      )}
    >
      <Plus className="size-4" aria-hidden="true" /> {t('recharger')} <StatusBadge label={t('bientot')} />
    </button>
  );
}
