'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ONGLETS = [
  { href: '/super-admin/boosts', cle: 'boosts' },
  { href: '/super-admin/boosts/catalogue', cle: 'catalogue' },
  { href: '/super-admin/boosts/stats', cle: 'stats' },
] as const;

/** TCK-633 lot F — boosts du parc, catalogue, statistiques : une entrée de menu, trois écrans. */
export function BoostsNav() {
  const t = useTranslations('superAdmin.boosts.tabs');
  const chemin = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-2">
      {ONGLETS.map((onglet) => {
        const actif = chemin === onglet.href;
        // Hors du `className` : `'default'` est un nom de variante, pas une classe (garde TCK-453).
        const variante = actif ? 'default' : 'outline';
        return (
          <Link
            key={onglet.href}
            href={onglet.href}
            aria-current={actif ? 'page' : undefined}
            className={cn(buttonVariants({ variant: variante, size: 'sm' }))}
          >
            {t(onglet.cle)}
          </Link>
        );
      })}
    </nav>
  );
}
