import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly eyebrow?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Unified page header for `/app` and `/admin` shells. Applies the DS Lin
 * typography (`font-display` on h1, `text-muted-foreground` on subtitle)
 * and exposes a slot for trailing actions (CTA buttons).
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
