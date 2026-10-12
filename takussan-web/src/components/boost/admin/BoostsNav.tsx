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
      {ONGLETS.map((onglet) => (
        <Link
          key={onglet.href}
          href={onglet.href}
          aria-current={chemin === onglet.href ? 'page' : undefined}
          className={cn(buttonVariants({ variant: chemin === onglet.href ? 'default' : 'outline', size: 'sm' }))}
        >
          {t(onglet.cle)}
        </Link>
      ))}
    </nav>
  );
}
