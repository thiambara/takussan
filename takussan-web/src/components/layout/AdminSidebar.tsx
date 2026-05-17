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
  Briefcase,
  Lock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isSuperAdmin } from '@/lib/roles';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import { fetchPropertyModerationQueue } from '@/lib/queries/property-moderation';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  locked?: boolean;
}

interface AdminSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
  /** `true` when the active agency is on `kind=standard`. Items in
   *  `PRO_ROUTES` are padlocked when this is `false` (individual) for
   *  agency_admins; super_admin is never padlocked. */
  agencyIsStandard?: boolean;
}

function buildAdminItems(
  user: User,
  reviewPendingCount: number,
  propertyPendingCount: number,
): NavItem[] {
  const items: NavItem[] = [{ href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard }];
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/properties', label: 'Biens', icon: Building2 });
  }
  items.push({ href: '/admin/team', label: 'Équipe', icon: Users });
  items.push({ href: '/admin/agency', label: 'Agence', icon: Briefcase });
  items.push({ href: '/admin/agency/kyc', label: 'KYC agence', icon: ShieldCheck });
  items.push({ href: '/admin/agency/billing', label: 'Abonnement', icon: CreditCard });
  items.push({ href: '/admin/finances', label: 'Finances', icon: CreditCard });
  if (isSuperAdmin(user.roles)) {
    items.push({
      href: '/admin/moderation',
      label: 'Modération avis',
      icon: Shield,
      badge: reviewPendingCount || undefined,
    });
  }
  // TCK-098 — property moderation is accessible to agency_admin + super_admin.
  items.push({
    href: '/admin/moderation/properties',
    label: 'Modération biens',
    icon: Building2,
    badge: propertyPendingCount || undefined,
  });
  items.push({ href: '/admin/roles', label: 'Rôles & Permissions', icon: ShieldCheck });
  items.push({ href: '/admin/audit', label: "Journal d'audit", icon: FileText });
  // `/api/admin/settings` is super-admin-only at the route middleware level
  // (`routes/api/admin.php` group), so showing this entry to agency_admin
  // only leads to a broken page. Restrict to super_admin.
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/settings', label: 'Paramètres', icon: Settings });
  }
  return items;
}

function AdminItem({
  href,
  label,
  icon: Icon,
  badge,
  locked,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  if (locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title="Réservé aux comptes pro"
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-white/40 opacity-60"
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate flex-1">{label}</span>
        <Lock className="ml-auto size-3.5 shrink-0" aria-hidden />
      </span>
    );
  }
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

export function AdminSidebar({ user, className, onNavigate, agencyIsStandard }: AdminSidebarProps) {
  const pathname = usePathname();
  const { token } = useAuth();

  const { data: modMeta } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () =>
      fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && isSuperAdmin(user.roles),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // TCK-098 — poll property moderation count (available to agency_admin too).
  // Standard-only feature: skip the poll for individual agencies (the entry
  // is padlocked in the sidebar and the backend returns 403 anyway).
  const { data: propModMeta } = useQuery({
    queryKey: ['property-moderation', 'pending-count'],
    queryFn: () =>
      fetchPropertyModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && agencyIsStandard !== false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items = buildAdminItems(user, modMeta?.pending_count ?? 0, propModMeta?.pending_count ?? 0)
    .map((item) => ({
      ...item,
      locked: isProRouteLocked(user, agencyIsStandard, item.href),
    }));
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
      <nav className="flex-1 overflow-y-auto space-y-1 px-3">
        {items.map((item) => {
          // Exact match for the dashboard root, prefix match for nested routes
          // so "Paramètres" stays highlighted on /admin/settings/tags etc.
          const active =
            item.href === '/admin' || item.href === '/admin/agency'
              ? pathname === item.href
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
