import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-2643 — une section numérotée de la création d'un bail (maquette `app-baux` a,
 * `SectionNumerotee`).
 *
 * - Dès `md`, une carte à pastille numérotée (une coche quand la section est complète) : la page
 *   entière, sections les unes sous les autres.
 * - Sous `md`, un écran par étape : la section n'a ni carte ni titre (le repère d'étapes et l'en-tête
 *   de la coque le disent), et `cachee` la retire de l'écran — par CSS, pour que chaque champ ne soit
 *   rendu qu'une fois et garde sa valeur d'une étape à l'autre.
 */
export function SectionDuBail({
  n,
  titre,
  faite,
  cachee,
  children,
  className,
}: {
  readonly n: number;
  readonly titre: string;
  readonly faite?: boolean;
  /** Sous `md` seulement : une autre étape est à l'écran. */
  readonly cachee?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const idTitre = `section-du-bail-${n}`;
  return (
    <section
      aria-labelledby={idTitre}
      className={cn('md:rounded-xl md:border md:border-border md:bg-card md:p-5', cachee && 'max-md:hidden', className)}
    >
      <div className="mb-4 flex items-center gap-3 max-md:sr-only">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-7 flex-none items-center justify-center rounded-full text-ui font-semibold tabular-nums',
            faite ? 'bg-success/15 text-success' : 'bg-foreground text-background',
          )}
        >
          {faite ? <Check className="size-4" strokeWidth={2.5} /> : n}
        </span>
        <h2 id={idTitre} className="text-base font-semibold">
          {titre}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** Un intertitre d'une étape au téléphone (« Loyer et charges », « Règles du bail »). */
export function TitreDeBloc({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <h3 className={cn('text-ui font-semibold text-muted-foreground', className)}>{children}</h3>;
}
