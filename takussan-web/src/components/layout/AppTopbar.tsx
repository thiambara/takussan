'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import type { User } from '@/types/user';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { UserMenu } from './UserMenu';
import { cn } from '@/lib/utils';

interface AppTopbarProps {
  user: User;
  onMenuToggle?: () => void;
}

export function AppTopbar({ user, onMenuToggle }: AppTopbarProps) {
  const router = useRouter();

  return (
    <header className={cn('flex h-14 shrink-0 items-center gap-3 bg-app-topbar px-4')}>
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label="Ouvrir le menu"
        className="inline-flex size-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link href="/" className="text-lg font-bold tracking-tighter text-white">
        Takussan
      </Link>

      <button
        type="button"
        onClick={() => router.push('/properties')}
        className="ml-6 hidden h-9 min-w-80 flex-1 items-center gap-2 rounded-full bg-white/10 px-4 text-left text-sm text-white/70 hover:bg-white/20 md:inline-flex"
      >
        <Search className="size-4" />
        <span>Rechercher des biens...</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* TCK-017 — language switcher persisted via cookie + (when logged in)
            PATCH /api/users/me by the client inside the switcher. */}
        <LanguageSwitcher
          variant="compact"
          className="bg-white/10 text-white ring-white/10 hover:bg-white/20"
        />
        <UserMenu user={user} variant="dark" />
      </div>
    </header>
  );
}
