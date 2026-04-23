'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Briefcase,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isSuperAdmin } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface AdminSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
}

function buildAdminItems(user: User): NavItem[] {
  const items: NavItem[] = [{ href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard }];
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/properties', label: 'Biens', icon: Building2 });
  }
  items.push({ href: '/admin/users', label: 'Équipe', icon: Users });
  items.push({ href: '/admin/agency', label: 'Agence', icon: Briefcase });
  items.push({ href: '/admin/finances', label: 'Finances', icon: CreditCard });
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/moderation', label: 'Modération', icon: Shield });
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
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AdminSidebar({ user, className, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();
  const items = buildAdminItems(user);
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
        {items.map((item) => {
          // Exact match for the dashboard root, prefix match for nested routes
          // so "Paramètres" stays highlighted on /admin/settings/tags etc.
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <AdminItem
              key={item.href}
              {...item}
              active={active}
              onNavigate={onNavigate}
            />
          );
        })}
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
