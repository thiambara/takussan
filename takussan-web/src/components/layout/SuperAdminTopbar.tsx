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
 * Topbar for the super-admin layout. Visually distinct (stone-900 + amber)
 * from the agency-side `AppTopbar` so the operator never confuses contexts.
 */
export function SuperAdminTopbar({ user, onMenuToggle }: SuperAdminTopbarProps) {
  const t = useTranslations('nav');

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center gap-3 bg-stone-950 px-4 text-stone-100 ring-1 ring-amber-500/30',
      )}
    >
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={t('openMenu')}
        className="inline-flex size-9 items-center justify-center rounded-md text-stone-200 hover:bg-stone-800 md:hidden"
      >
        <Menu className="size-5" />
      </button>
      <Link href="/super-admin" className="text-lg font-bold tracking-tighter text-amber-200">
        {t('superAdmin.topbarBrand')}
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher
          variant="compact"
          className="bg-stone-800 text-stone-100 ring-stone-700 hover:bg-stone-700"
        />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
