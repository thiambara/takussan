import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface FormErrorProps {
  readonly children?: React.ReactNode;
  readonly id?: string;
  readonly className?: string;
}

/**
 * Inline error message rendered under a form field.
 *
 * Renders nothing when there is no content so consumers can pass a
 * potentially empty `fieldState.error?.message` without guards. Use the
 * `id` prop to wire `aria-describedby` from the input.
 */
export function FormError({ children, id, className }: FormErrorProps) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn('mt-1 flex items-center gap-1 text-xs text-destructive', className)}
    >
      <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export interface FormGlobalErrorProps {
  readonly children?: React.ReactNode;
  readonly className?: string;
}

/**
 * Banner-style error shown at the top of a form, typically for the
 * non-field-specific message from a 4xx response.
 */
export function FormGlobalError({ children, className }: FormGlobalErrorProps) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        'mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600',
        className,
      )}
    >
      {children}
    </div>
  );
}
