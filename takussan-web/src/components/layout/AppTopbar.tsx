'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { User } from '@/types/user';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ProfileSwitcher } from '@/components/profile/ProfileSwitcher';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface AppTopbarProps {
  user: User;
  onMenuToggle?: () => void;
}

export function AppTopbar({ user, onMenuToggle }: AppTopbarProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <header className={cn('flex h-14 shrink-0 items-center gap-3 bg-app-topbar px-4')}>
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={t('openMenu')}
        className="inline-flex size-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link href="/" className="text-lg font-bold tracking-tighter text-white">
        {tCommon('appName')}
      </Link>

      <SearchAutocomplete
        variant="navbar"
        className="ml-6 hidden md:block min-w-80 flex-1"
      />

      <div className="ml-auto flex items-center gap-2">
        <ProfileSwitcher user={user} />
        {/* TCK-017 — language switcher persisted via cookie + (when logged in)
            PATCH /api/users/me by the client inside the switcher. */}
        <LanguageSwitcher
          variant="compact"
          className="bg-white/10 text-white ring-white/10 hover:bg-white/20"
        />
        <NotificationBell />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
