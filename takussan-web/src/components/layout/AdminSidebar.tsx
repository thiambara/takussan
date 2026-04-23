'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  ShieldCheck,
  FileText,
  Settings,
  ArrowLeft,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isSuperAdmin } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface AdminSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
}

function buildAdminItems(user: User, pendingCount: number): NavItem[] {
  const items: NavItem[] = [{ href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard }];
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/properties', label: 'Biens', icon: Building2 });
  }
  items.push({ href: '/admin/team', label: 'Équipe', icon: Users });
  items.push({ href: '/admin/finances', label: 'Finances', icon: CreditCard });
  if (isSuperAdmin(user.roles)) {
    items.push({
      href: '/admin/moderation',
      label: 'Modération',
      icon: Shield,
      badge: pendingCount || undefined,
    });
  }
  items.push({ href: '/admin/roles', label: 'Rôles & Permissions', icon: ShieldCheck });
  items.push({ href: '/admin/audit', label: "Journal d'audit", icon: FileText });
  items.push({ href: '/admin/settings', label: 'Paramètres', icon: Settings });
  return items;
}

function AdminItem({
  href,
  label,
  icon: Icon,
  badge,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-white/10 font-semibold text-white'
          : 'text-white/70 hover:bg-white/5',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {badge ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500/80 px-1.5 text-[10px] font-bold text-white"
          aria-label={`${badge} en attente`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminSidebar({ user, className, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();
  const { token } = useAuth();

  // Poll the moderation queue count so the sidebar badge stays fresh.
  const { data: modMeta } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () =>
      fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && isSuperAdmin(user.roles),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items = buildAdminItems(user, modMeta?.pending_count ?? 0);
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-app-topbar text-white', className)}>
      <div className="px-6 py-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-xl font-bold tracking-tighter text-white"
        >
          Takussan
        </Link>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/60">Administration</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => (
          <AdminItem
            key={item.href}
            {...item}
            active={pathname === item.href}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className="space-y-2 px-3 pb-4">
        <Link
          href="/app"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/5"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span>Retour à l&apos;espace perso</span>
        </Link>
        <Link
          href="/app/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/5"
        >
          <Avatar className="size-9">
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
            <AvatarFallback className="bg-white/10 text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
            <p className="truncate text-xs text-white/60">Mon profil</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
