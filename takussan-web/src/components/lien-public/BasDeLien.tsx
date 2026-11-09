import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * TCK-2505 — l'action « sous le pouce » d'une page par lien : collée en bas de l'écran au
 * téléphone, posée en pied de carte en bureau.
 */
export function BasDeLien({
  children,
  className,
  ...props
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}) {
  return (
    <div
      data-testid={props['data-testid']}
      className={cn(
        'sticky bottom-0 z-10 mt-auto space-y-2.5 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3',
        'lg:static lg:rounded-b-2xl lg:px-5 lg:py-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
