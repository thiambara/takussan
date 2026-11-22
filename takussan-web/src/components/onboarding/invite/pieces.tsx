'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-2613 — les pièces communes des deux écrans des assistants d'invité (maquette `app-entree-assistants`,
 * approche a) : le titre d'écran, le bandeau « Numéro vérifié », le numéro masqué.
 */

/** Le titre d'un écran d'invité : 26 px au téléphone, 34 px rabattus à 32 au bureau (maquette `Titre`, `TitreBureau`). */
export function TitreDInvite({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <h1
      className={cn(
        'font-display text-affiche-26 font-semibold leading-[1.15] tracking-[-0.02em] text-balance lg:text-affiche-32 lg:leading-[1.1] lg:tracking-[-0.025em]',
        className,
      )}
    >
      {children}
    </h1>
  );
}

/**
 * « 77 •• •• 45 67 » : les deux premiers chiffres et les quatre derniers d'un numéro sénégalais (maquette
 * `NumeroVerifie`). Un numéro étranger ou incomplet ne montre que ses quatre derniers chiffres.
 */
export function numeroMasqueDInvite(telephone: string | null | undefined): string {
  let chiffres = (telephone ?? '').replace(/\D+/g, '');
  if (chiffres.length === 12 && chiffres.startsWith('221')) chiffres = chiffres.slice(3);
  if (chiffres.length === 9) return `${chiffres.slice(0, 2)} •• •• ${chiffres.slice(5, 7)} ${chiffres.slice(7)}`;
  if (chiffres.length < 4) return '••••';
  return `•• ${chiffres.slice(-4)}`;
}

/** Le bandeau qui reste en tête des écrans d'après le code (maquette `NumeroVerifie`). */
export function NumeroVerifie({ telephone, className }: { readonly telephone: string | null | undefined; readonly className?: string }) {
  const t = useTranslations('onboarding.invite.numero');
  return (
    <p
      role="status"
      data-numero-verifie=""
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-full bg-success/12 pl-2 pr-3 text-[0.8125rem] font-medium text-success', className)}
    >
      <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
      {t.rich('verifie', { numero: numeroMasqueDInvite(telephone), chiffres: (m) => <span className="tabular-nums">{m}</span> })}
    </p>
  );
}
