'use client';

import Link from 'next/link';
import { Coins } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { HREF_CREDITS } from '@/lib/navigation/acces-app';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { cn } from '@/lib/utils';

export interface PastilleCreditsProps {
  /** `clair` : navbar publique (fond `--background`) ; `sombre` : barre d'encre de `/app`. */
  readonly ton: 'clair' | 'sombre';
  readonly className?: string;
}

const TONS: Record<PastilleCreditsProps['ton'], string> = {
  clair: 'min-h-10 px-3.5 text-foreground ring-1 ring-inset ring-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
  // Même aplat que le choix de langue voisin dans la barre de `/app` — mais par le JETON
  // `background` (le lin, #fcf9f3) et non `white` : la barre est `bg-foreground`, et la garde des
  // jetons de `/app` (`scripts/check-super-admin-tokens.mjs`) refuse tout `*-white` neuf.
  sombre: 'h-8 px-3 bg-background/10 text-background hover:bg-background/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background',
};

const ICONE: Record<PastilleCreditsProps['ton'], string> = {
  clair: 'text-primary',
  sombre: 'text-background/75',
};

/**
 * TCK-642 — le solde de crédits de l'espace actif, en pastille qui mène à `/app/credits`.
 *
 * ⚠ **L'appelant ne la monte que pour qui voit le portefeuille** (`voitLePortefeuille`) : elle lit
 * l'API dès son montage. Elle ne rend RIEN tant que le solde n'est pas connu — chargement, refus,
 * espace absent, panne : jamais un « 0 » qui ne serait pas un solde.
 *
 * Le nombre seul est visible ; le nom accessible dit ce qu'il compte (« Crédits : 12 crédits »).
 * Chiffres tabulaires : le solde change sans faire danser la barre.
 */
export function PastilleCredits({ ton, className }: PastilleCreditsProps) {
  const t = useTranslations('nav');
  const format = useFormatter();
  const solde = useSoldeCredits({ enabled: true });
  if (solde === null) return null;

  return (
    <Link
      href={HREF_CREDITS}
      aria-label={t('creditsBalance', { count: solde })}
      data-slot="pastille-credits"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full text-sm font-semibold tabular-nums whitespace-nowrap outline-none transition-[background-color,scale] active:scale-[0.96]',
        TONS[ton],
        className,
      )}
    >
      <Coins className={cn('size-4 shrink-0', ICONE[ton])} aria-hidden="true" />
      {format.number(solde)}
    </Link>
  );
}
