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
 *
 * ⚠ Le bandeau portait vert 50 / vert 100 / vert 700 — l'échelle Tailwind, pas la charte. Porté
 * sur `--success` (TCK-381) par TCK-384, sur la même forme que `FormError` et que le ton
 * `success` de `ui/toast.tsx`.
 *
 * Contraste mesuré (WCAG 2.1, 2026-08-27) :
 *
 *   avant   vert 700 #008236 sur vert 50 #f0fdf4 ............ 4,72:1
 *   après   --success #3f6b45 sur success/5 sur --card ...... 5,78:1   (AA texte normal)
 *   après   --success #8fbf87 sur success/10 sur --card sombre .. 6,26:1
 *
 * Le `-50` ne se retournait pas sous `.dark` : `#f0fdf4` y restait `#f0fdf4`, avec du vert 700
 * par-dessus sur une page sombre. Un aplat à canal alpha se pose sur `--card` et suit le thème
 * par construction — c'est la mesure n°2 du docblock de `charts/StatCard.tsx`.
 */
export function FormSuccess({ children, className }: FormSuccessProps) {
  if (!children) return null;
  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success',
        className,
      )}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
