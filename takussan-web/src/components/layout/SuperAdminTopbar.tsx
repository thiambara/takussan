'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { User } from '@/types/user';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface SuperAdminTopbarProps {
  user: User;
  onMenuToggle?: () => void;
}

/**
 * Topbar for the super-admin layout, visuellement distincte de l'`AppTopbar` agence pour que
 * l'opérateur ne confonde jamais les deux contextes.
 *
 * TCK-358 : la surface reste sombre, mais par jetons — la barre porte `dark` et lit
 * `--background` / `--foreground` / `--primary` de la rampe sombre. Elle est ainsi d'un cran
 * plus sombre que la barre latérale (`--background` #1f1812 contre `--sidebar` #2a2018), ce que
 * l'ancien couple pierre 950 / pierre 900 faisait à la main. Le mécanisme et sa raison
 * sont documentés dans `SuperAdminSidebar`.
 */
export function SuperAdminTopbar({ user, onMenuToggle }: SuperAdminTopbarProps) {
  const t = useTranslations('nav');

  return (
    <header
      className={cn(
        'dark flex h-14 shrink-0 items-center gap-3 bg-background px-4 text-foreground ring-1 ring-primary/40',
      )}
    >
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={t('openMenu')}
        className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
      >
        <Menu className="size-5" />
      </button>
      <Link href="/super-admin" className="text-lg font-bold tracking-tighter text-primary">
        {t('superAdmin.topbarBrand')}
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher
          variant="compact"
          className="bg-muted text-foreground ring-border hover:bg-foreground/15"
        />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
