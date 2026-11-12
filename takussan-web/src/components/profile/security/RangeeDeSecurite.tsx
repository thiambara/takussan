import type { ComponentType, ReactNode, SVGProps } from 'react';

import { cn } from '@/lib/utils';

interface RangeeDeSecuriteProps {
  readonly icone: ComponentType<SVGProps<SVGSVGElement>>;
  /** Le titre de la rangée — un `h3` (la section « Sécurité » porte le `h2`), un `h4` sous un bloc titré. */
  readonly titre: ReactNode;
  readonly niveau?: 'h3' | 'h4';
  /** La pastille de statut, à côté du titre (« Désactivée », « Non vérifié », « Cet appareil »). */
  readonly statut?: ReactNode;
  readonly detail?: ReactNode;
  /** Le geste de la rangée, à droite (« Activer », « Vérifier », « Déconnecter »). */
  readonly action?: ReactNode;
  /** Ce que le geste déplie sous la rangée (code à saisir, codes de secours…). */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * TCK-2635 — une rangée de la section « Sécurité » (maquette `app-profil`, `RangeeSecurite`) : une
 * pastille d'icône de 36 px, le titre et son statut, le détail dessous, le geste à droite. Les rangées
 * se posent dans une seule carte à filets (`ListeDeSecurite`). Ce que le geste ouvre se déplie sous la
 * rangée, dans la même carte.
 */
export function RangeeDeSecurite({ icone: Icone, titre, niveau: Titre = 'h3', statut, detail, action, children, className, 'data-testid': testId }: RangeeDeSecuriteProps) {
  return (
    <div data-slot="rangee-de-securite" data-testid={testId} className={cn('px-4 py-3.5', className)}>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 flex-none items-center justify-center self-start rounded-full bg-muted text-foreground/75">
          <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Titre className="text-corps font-medium">{titre}</Titre>
            {statut}
          </div>
          {detail ? <p className="text-ui leading-snug text-muted-foreground">{detail}</p> : null}
        </div>
        {action}
      </div>
      {/* `empty:hidden` : un dépliement dont chaque partie est fermée ne laisse pas de marge. */}
      {children ? <div className="mt-3 grid gap-3 empty:hidden sm:pl-12">{children}</div> : null}
    </div>
  );
}

/** La carte à filets qui porte les rangées. */
export function ListeDeSecurite({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card', className)}>
      {children}
    </div>
  );
}
