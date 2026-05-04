'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AdminAgencyUserRow } from '@/types/admin-users';

type SortableKey = 'created_at' | 'last_login_at' | 'first_name';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  inactive: { label: 'Inactif', cls: 'bg-stone-500/10 text-stone-600 border-stone-200' },
  banned: { label: 'Bloqué', cls: 'bg-red-500/10 text-red-700 border-red-200' },
};

const ROLE_LABEL: Record<string, string> = {
  agency_admin: 'Administrateur',
  agent: 'Agent',
  owner: 'Bailleur',
  tenant: 'Locataire',
  customer: 'Client',
  service_provider: 'Prestataire',
  super_admin: 'Super admin',
  admin: 'Admin',
};

function getInitials(u: AdminAgencyUserRow): string {
  return `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '·';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface AdminUsersTableProps {
  rows: AdminAgencyUserRow[];
  total: number;
  currentUserId: number;
  onSelect: (user: AdminAgencyUserRow) => void;
  onQuickAction: (user: AdminAgencyUserRow, action: 'block' | 'activate') => void;
}

export function AdminUsersTable({
  rows,
  total,
  currentUserId,
  onSelect,
  onQuickAction,
}: AdminUsersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = searchParams.get('sort') ?? '-created_at';

  const onSortClick = useCallback(
    (key: SortableKey) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = sort === `-${key}` ? key : `-${key}`;
      params.set('sort', next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams, sort],
  );

  const renderSort = (key: SortableKey) => {
    if (sort === key) return <ArrowUp className="ml-1 inline size-3" aria-hidden="true" />;
    if (sort === `-${key}`) return <ArrowDown className="ml-1 inline size-3" aria-hidden="true" />;
    return <ArrowUpDown className="ml-1 inline size-3 opacity-40" aria-hidden="true" />;
  };

  return (
    <div className="overflow-hidden rounded-xl bg-app-surface-1">
      <table className="w-full text-sm" data-testid="admin-users-table">
        <thead>
          <tr className="bg-app-surface-2/50 text-left text-xs uppercase tracking-wide text-app-ink-muted">
            <th className="px-4 py-3 font-semibold">
              <button type="button" onClick={() => onSortClick('first_name')} className="flex items-center">
                Membre {renderSort('first_name')}
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Rôle</th>
            <th className="px-4 py-3 font-semibold">Statut</th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" onClick={() => onSortClick('last_login_at')} className="flex items-center">
                Dernière connexion {renderSort('last_login_at')}
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" onClick={() => onSortClick('created_at')} className="flex items-center">
                Créé le {renderSort('created_at')}
              </button>
            </th>
            <th className="px-4 py-3 text-right font-semibold sr-only">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-surface-2">
          {rows.map((row) => {
            const status = STATUS_BADGE[row.status] ?? { label: row.status, cls: '' };
            const isSelf = row.id === currentUserId;
            const isBlocked = row.status === 'banned';
            return (
              <tr key={row.id} data-testid={`admin-user-row-${row.id}`}>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(row)}
                    className="flex items-center gap-3 text-left"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback>{getInitials(row)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-app-ink">
                        {row.first_name} {row.last_name}
                      </p>
                      {isSelf ? (
                        <p className="text-xs text-app-ink-muted">Vous</p>
                      ) : null}
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3 text-app-ink-muted">
                  <a href={`mailto:${row.email}`} className="hover:underline">
                    {row.email}
                  </a>
                </td>
                <td className="px-4 py-3">
                  {row.roles?.length ? (
                    <Badge
                      variant="outline"
                      className="border-primary/30 bg-primary/5 text-primary"
                    >
                      {ROLE_LABEL[row.roles[0].name] ?? row.roles[0].name}
                    </Badge>
                  ) : (
                    <span className="text-xs text-app-ink-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={status.cls}>
                    {status.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-app-ink-muted">{formatDate(row.last_login_at)}</td>
                <td className="px-4 py-3 text-app-ink-muted">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions pour ${row.first_name} ${row.last_name}`}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSelect(row)}>
                        Voir le détail
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {isBlocked ? (
                        <DropdownMenuItem
                          disabled={isSelf}
                          onClick={() => onQuickAction(row, 'activate')}
                        >
                          Réactiver
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={isSelf}
                          onClick={() => onQuickAction(row, 'block')}
                          className="text-destructive"
                        >
                          Bloquer
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-app-surface-2 px-4 py-2 text-xs text-app-ink-muted">
        {total} utilisateur{total > 1 ? 's' : ''}
      </p>
    </div>
  );
}
