import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LifeBuoy, Link2Off, Search } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { cn } from '@/lib/utils';

import { MAILTO_AIDE } from './aide';
import { CarteDeLien } from './CarteDeLien';

/**
 * TCK-2514 — l'état commun d'un lien qui ne sert plus (expiré, invalide, révoqué, déjà utilisé) :
 * jamais un cul-de-sac, toujours deux issues — « Rechercher des biens » et « Besoin d'aide ? ». Sert
 * aussi le paiement (TCK-2505) et la réclamation (TCK-2512).
 */
export function LienMort({
  titre,
  children,
  icone,
  className,
  ...props
}: {
  readonly titre: ReactNode;
  readonly children?: ReactNode;
  readonly icone?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}) {
  return (
    <CarteDeLien
      data-testid={props['data-testid'] ?? 'lien-mort'}
      className={cn('pb-8', className)}
      icone={icone ?? <Link2Off />}
      titre={titre}
      actions={<IssuesDuLien />}
    >
      {children}
    </CarteDeLien>
  );
}

/** Les deux issues d'un cul-de-sac. */
export function IssuesDuLien() {
  const t = useTranslations('lienPublic.mort');
  return (
    <>
      <LienLocalise href="/properties" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
        <Search aria-hidden="true" />
        {t('rechercher')}
      </LienLocalise>
      <a href={MAILTO_AIDE} className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full underline underline-offset-4')}>
        <LifeBuoy aria-hidden="true" />
        {t('aide')}
      </a>
    </>
  );
}
