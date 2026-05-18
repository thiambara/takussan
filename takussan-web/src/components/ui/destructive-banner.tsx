import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type DestructiveBannerProps = ComponentPropsWithoutRef<'div'> & {
  icon?: ReactNode;
};

function DestructiveBanner({
  className,
  children,
  icon,
  role = 'alert',
  ...props
}: DestructiveBannerProps) {
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20',
        className,
      )}
      {...props}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export { DestructiveBanner };
export type { DestructiveBannerProps };
