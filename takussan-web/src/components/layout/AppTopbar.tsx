'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Search, LogOut, UserCircle, ShieldCheck } from 'lucide-react';
import type { User } from '@/types/user';
import { isAdmin } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/app/actions/auth';
import { cn } from '@/lib/utils';

interface AppTopbarProps {
  user: User;
  onMenuToggle?: () => void;
}

export function AppTopbar({ user, onMenuToggle }: AppTopbarProps) {
  const router = useRouter();
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  return (
    <header className={cn('flex h-14 shrink-0 items-center gap-3 bg-[#022448] px-4')}>
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

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-white hover:bg-white/10">
            <Avatar className="size-8">
              {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
              <AvatarFallback className="bg-white/20 text-white text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">{user.first_name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{user.full_name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/app/profile')}>
              <UserCircle className="size-4" />
              <span>Mon profil</span>
            </DropdownMenuItem>
            {isAdmin(user.roles) && (
              <DropdownMenuItem onClick={() => router.push('/admin')}>
                <ShieldCheck className="size-4" />
                <span>Administration</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await logoutAction();
              }}
            >
              <LogOut className="size-4" />
              <span>Déconnexion</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
