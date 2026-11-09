import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * TCK-2514 — « la carte au centre » : un pictogramme, un titre qui dit ce qui va se passer, une
 * phrase, puis les actions. Le gabarit commun des pages par lien (document, alertes,
 * désinscriptions) et de leurs états (fait, lien mort). Le titre est le `<h1>` de la page.
 */
export function CarteDeLien({
  icone,
  titre,
  children,
  actions,
  ton = 'neutre',
  className,
  ...props
}: {
  readonly icone: ReactNode;
  readonly titre: ReactNode;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly ton?: 'neutre' | 'succes' | 'alerte';
  readonly className?: string;
  readonly 'data-testid'?: string;
}) {
  return (
    <section className={cn('px-5 pt-10 text-center lg:pt-8', className)} data-testid={props['data-testid']}>
      <span
        className={cn(
          'mx-auto inline-flex size-14 items-center justify-center rounded-2xl [&_svg]:size-7',
          ton === 'succes' && 'bg-success/12 text-success',
          ton === 'alerte' && 'bg-secondary text-primary-deep',
          ton === 'neutre' && 'bg-muted text-foreground',
        )}
        aria-hidden="true"
      >
        {icone}
      </span>
      <h1 className="mx-auto mt-5 max-w-[22rem] font-display text-2xl font-semibold leading-tight tracking-[-0.02em] text-balance text-foreground">
        {titre}
      </h1>
      {children ? (
        <div className="mx-auto mt-2.5 max-w-[22rem] text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {children}
        </div>
      ) : null}
      {actions ? <div className="mx-auto mt-6 flex max-w-[22rem] flex-col gap-2.5">{actions}</div> : null}
    </section>
  );
}
