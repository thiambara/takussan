'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, UserCircle } from 'lucide-react';
import type { User } from '@/types/user';
import { isAdmin } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/app/actions/auth';
import { cn } from '@/lib/utils';

export interface UserMenuProps {
  readonly user: User;
  readonly className?: string;
  /**
   * Visual variant — `dark` inverts foreground colours for placement on a
   * dark topbar (used by the authenticated dashboard). `light` is the
   * default and pairs with a light surface.
   */
  readonly variant?: 'dark' | 'light';
}

/**
 * Reusable user menu dropdown rendered in the dashboard topbar and the
 * public header when the visitor is authenticated. Exposes profile +
 * admin shortcut + logout action.
 */
export function UserMenu({ user, className, variant = 'dark' }: UserMenuProps) {
  const router = useRouter();
  // Use `Array.from` so names starting with an emoji or astral character
  // (surrogate pair) don't produce a broken half-glyph in the avatar.
  const firstInitial = Array.from(user.first_name ?? '')[0] ?? '';
  const lastInitial = Array.from(user.last_name ?? '')[0] ?? '';
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();
  const isDark = variant === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu utilisateur — ${user.full_name}`}
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
          isDark ? 'text-white hover:bg-white/10' : 'text-foreground hover:bg-muted',
          className,
        )}
      >
        <Avatar className="size-8">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
          <AvatarFallback
            className={cn(
              'text-xs',
              isDark ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:inline">{user.first_name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.full_name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/app/profile')}>
          <UserCircle className="size-4" aria-hidden="true" />
          <span>Mon profil</span>
        </DropdownMenuItem>
        {isAdmin(user.roles) && (
          <DropdownMenuItem onClick={() => router.push('/admin')}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>Administration</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await logoutAction();
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>Déconnexion</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
