import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface FormSuccessProps {
  readonly children?: React.ReactNode;
  readonly className?: string;
}

/**
 * Banner-style success message rendered inline inside a form (typically
 * above the submit button) after a successful submission when the page
 * doesn't immediately navigate away.
 */
export function FormSuccess({ children, className }: FormSuccessProps) {
  if (!children) return null;
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700',
        className,
      )}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
