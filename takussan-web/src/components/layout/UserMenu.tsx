'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, UserCircle, UserRound } from 'lucide-react';
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
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe, prenomDe } from '@/lib/identite';

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
  const { logout } = useAuth();
  const t = useTranslations('nav');
  // TCK-623 — `initialesDe` garde le `Array.from` (un emoji en tête reste entier) et rend `null`
  // pour un compte sans nom ni e-mail : une silhouette, plutôt qu'une pastille vide.
  const initials = initialesDe(user);
  const libelle = libelleDe(user) ?? t('accountFallback');
  const isDark = variant === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('userMenuFor', { name: libelle })}
        className={cn(
          'relative inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition-colors after:absolute after:inset-x-0 after:-inset-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/50',
          isDark ? 'text-white hover:bg-white/10' : 'text-foreground hover:bg-muted',
          className,
        )}
      >
        <Avatar className="size-8">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={libelle} /> : null}
          <AvatarFallback
            className={cn(
              'text-xs',
              isDark ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
            )}
          >
            {initials ?? <UserRound className="size-4" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
        {/* TCK-505 (#1) — sous `lg`, l'avatar seul : à 768 la barre haute n'a pas la place du prénom. */}
        <span className="hidden lg:inline">{prenomDe(user) ?? t('accountFallback')}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{libelle}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/app/profile')}>
          <UserCircle className="size-4" aria-hidden="true" />
          <span>{t('myProfile')}</span>
        </DropdownMenuItem>
        {isAdmin(user.roles) && (
          <DropdownMenuItem onClick={() => router.push('/admin')}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{t('administration')}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            // TCK-509 — par le contexte, et non plus par une server action : celle-ci effaçait le
            // cookie côté serveur sans que le client l'apprenne, et le navigateur continuait de
            // transmettre le jeton révoqué — y compris au compte connecté ensuite.
            await logout();
            router.replace('/auth/login');
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>{t('logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
