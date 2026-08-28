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
 *
 * ⚠ **Le bandeau portait rouge 50 / rouge 100 / rouge 600 quand son voisin `FormError`, dix
 * lignes plus haut, rendait déjà `text-destructive`** — deux façons de dire « erreur » dans le
 * même fichier, dont une seule suivait le thème. Porté sur `--destructive` par TCK-384, sur la
 * forme que `ui/toast.tsx` emploie déjà pour son ton `error`.
 *
 * Contraste mesuré (WCAG 2.1, 2026-08-27) — l'échange est NEUTRE, et c'est écrit parce que la
 * mesure contredisait l'attente :
 *
 *   avant   rouge 600 #e7000b sur rouge 50 #fef2f2 ................ 4,36:1
 *   après   --destructive #e7000b sur destructive/5 sur --card .... 4,36:1
 *
 * Les deux encres sont le MÊME hexadécimal — `--destructive` vaut `oklch(0.577 0.245 27.325)`,
 * qui est exactement la définition de rouge 600 en Tailwind v4. Le gain n'est donc pas le
 * contraste en clair : c'est le thème SOMBRE, où `#fef2f2` restait `#fef2f2` sous `.dark`
 * pendant que `--destructive` bascule — **5,16:1 sur `--card` sombre**.
 *
 * ⚠ Ce docblock a écrit **4,78:1** pendant une journée, et l'erreur mérite d'être nommée : c'est
 * le ratio de `destructive/10`, pas celui de `destructive/5` que ce bandeau rend. J'avais mesuré
 * la bonne couleur sur la mauvaise opacité. *Se tromper dans le sens PRUDENT reste se tromper* —
 * quelqu'un resserre un seuil sur ces nombres-là. (Revue adverse de TCK-384, 2026-08-27.)
 *
 * ⚠ Ni l'un ni l'autre n'atteint les 4,5:1 d'AA pour du texte normal. C'est un CONSTAT, pas un
 * correctif de ce ticket : le porter demanderait de changer la valeur de `--destructive`, qui
 * est une décision de charte — la même que TCK-404 porte pour `--chart-3`.
 */
export function FormGlobalError({ children, className }: FormGlobalErrorProps) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        'mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive',
        className,
      )}
    >
      {children}
    </div>
  );
}
