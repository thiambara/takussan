'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate as formatDateIntl } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';

/**
 * TCK-292 — la donnée ne porte plus que ce qu'elle sait : le TON du badge.
 * Le libellé se résout sous `admin.users.status.*` / `admin.users.roles.*`, et
 * une valeur inconnue du dictionnaire retombe sur la valeur brute de l'API,
 * exactement comme avant.
 *
 * TCK-373 — c'était une table de CLASSES (`bg-emerald-500/10`, `bg-stone-500/10`,
 * `bg-red-500/10`), l'une des quatre recettes de « succès » de la console. Le ton dit
 * désormais ce que le statut veut dire ; la couleur se décide dans `StatusBadge`.
 * Cette table garde son second rôle, qui n'est pas décoratif : une clé absente
 * signale un statut que le dictionnaire ne connaît pas, et le libellé retombe alors
 * sur la valeur brute.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  inactive: 'neutral',
  banned: 'danger',
};

const ROLE_KEYS = new Set([
  'agency_admin',
  'agent',
  'owner',
  'tenant',
  'customer',
  'service_provider',
  'super_admin',
  'admin',
]);

function getInitials(u: AdminAgencyUserRow): string {
  return `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '·';
}

/**
 * TCK-292 — la locale ACTIVE, plus `fr-FR` en dur : « 05 août 2026 » s'affichait
 * en français quelle que soit la langue choisie. Options identiques à l'ancienne
 * version — le rendu français ne bouge pas.
 */
function formatDate(value: string | null, locale: Locale): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  // `formatDate` pose `dateStyle: 'medium'` par défaut, et Intl REFUSE `dateStyle`
  // mêlé à des champs explicites — on le neutralise.
  return formatDateIntl(d, locale, {
    dateStyle: undefined,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface AdminUsersTableProps {
  rows: AdminAgencyUserRow[];
  total: number;
  currentUserId: number;
  /**
   * TCK-279 (AC11) — le ou les `AgencyRole` que porte chaque utilisateur
   * DANS cette agence, indexés par `user_id`.
   *
   * Optionnel, et le repli est le TYPE de profil (`row.roles`) : la carte
   * arrive par une seconde requête, et afficher « — » pendant qu'elle
   * voyage remplacerait une donnée juste par un vide qui se lit comme une
   * absence de rôle. La colonne se précise quand la réponse arrive.
   */
  assignmentsByUser?: ReadonlyMap<number, readonly AgencyRoleAssignment[]>;
  onSelect: (user: AdminAgencyUserRow) => void;
  onQuickAction: (user: AdminAgencyUserRow, action: 'block' | 'activate') => void;
  onRemove?: (user: AdminAgencyUserRow) => void;
}

export function AdminUsersTable({
  rows,
  total,
  currentUserId,
  assignmentsByUser,
  onSelect,
  onQuickAction,
  onRemove,
}: AdminUsersTableProps) {
  const t = useTranslations('admin.users');
  const locale = useLocale() as Locale;
  const roleLabel = (name: string) => (ROLE_KEYS.has(name) ? t(`roles.${name}`) : name);
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = searchParams.get('sort') ?? '-created_at';

  const onSortChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('sort', next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const columns: readonly DataTableColumn<AdminAgencyUserRow>[] = [
    {
      id: 'member',
      header: t('table.member'),
      sortKey: 'first_name',
      sortLabel: t('table.member'),
      cell: (row) => (
        <button
          type="button"
          onClick={() => onSelect(row)}
          className="flex items-center gap-3 text-left"
        >
          <Avatar className="size-9">
            <AvatarFallback>{getInitials(row)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-foreground">
              {row.first_name} {row.last_name}
            </p>
            {row.id === currentUserId ? (
              <p className="text-xs text-muted-foreground">{t('table.you')}</p>
            ) : null}
          </div>
        </button>
      ),
    },
    {
      id: 'email',
      header: t('table.email'),
      className: 'text-muted-foreground',
      cell: (row) => (
        <a href={`mailto:${row.email}`} className="hover:underline">
          {row.email}
        </a>
      ),
    },
    {
      id: 'role',
      header: t('table.role'),
      cell: (row) => {
        // TCK-279 (AC11) — le nom de l'`AgencyRole` prime sur le TYPE de profil : deux agents
        // de la même agence peuvent porter « Agent » et « Agent senior », et c'est exactement
        // la distinction que cette colonne existe pour montrer depuis ce ticket.
        const assignments = assignmentsByUser?.get(row.id) ?? [];
        if (assignments.length > 0) {
          return (
            <span className="flex flex-wrap gap-1">
              {assignments.map((a) => (
                <Badge
                  key={`${a.profile_type}-${a.profile_id}`}
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-primary"
                >
                  {a.agency_role_name ?? roleLabel(a.profile_type)}
                </Badge>
              ))}
            </span>
          );
        }

        // TCK-278 — `row.roles` peut être `string[]` (UserResource standard) ou
        // `Array<{name}>` (vue admin détaillée). Normalise pour récupérer un label.
        const first = row.roles?.[0];
        const name = typeof first === 'string' ? first : first?.name;
        return name ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            {roleLabel(name)}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'status',
      header: t('table.status'),
      cell: (row) => (
        <StatusBadge
          tone={STATUS_TONES[row.status] ?? 'neutral'}
          label={STATUS_TONES[row.status] !== undefined ? t(`status.${row.status}`) : row.status}
        />
      ),
    },
    {
      id: 'lastLogin',
      header: t('table.lastLogin'),
      sortKey: 'last_login_at',
      sortLabel: t('table.lastLogin'),
      className: 'text-muted-foreground',
      cell: (row) => formatDate(row.last_login_at, locale),
    },
    {
      id: 'createdAt',
      header: t('table.createdAt'),
      sortKey: 'created_at',
      sortLabel: t('table.createdAt'),
      className: 'text-muted-foreground',
      cell: (row) => formatDate(row.created_at, locale),
    },
    {
      id: 'actions',
      header: t('table.actions'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => {
        const isSelf = row.id === currentUserId;
        const isBlocked = row.status === 'banned';
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('table.actionsAria', {
                    name: `${row.first_name} ${row.last_name}`,
                  })}
                />
              )}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSelect(row)}>
                {t('table.viewDetail')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isBlocked ? (
                <DropdownMenuItem disabled={isSelf} onClick={() => onQuickAction(row, 'activate')}>
                  {t('table.reactivate')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={isSelf}
                  onClick={() => onQuickAction(row, 'block')}
                  className="text-destructive"
                >
                  {t('table.block')}
                </DropdownMenuItem>
              )}
              {onRemove ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isSelf}
                    onClick={() => onRemove(row)}
                    className="text-destructive"
                  >
                    {t('table.removeFromAgency')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl bg-card">
      <DataTable
        caption={t('table.caption')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowProps={(row) => ({ 'data-testid': `admin-user-row-${row.id}` })}
        sort={{ value: sort, onChange: onSortChange }}
        data-testid="admin-users-table"
        className="rounded-none ring-0"
      />
      <p className="border-t border-muted px-4 py-2 text-xs text-muted-foreground">
        {t('table.count', { count: total, total: String(total) })}
      </p>
    </div>
  );
}
