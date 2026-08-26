'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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
import { formatDate as formatDateIntl } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';

type SortableKey = 'created_at' | 'last_login_at' | 'first_name';

/**
 * TCK-292 — la donnée ne porte plus que ce qu'elle sait : la CLASSE du badge.
 * Le libellé se résout sous `admin.users.status.*` / `admin.users.roles.*`, et
 * une valeur inconnue du dictionnaire retombe sur la valeur brute de l'API,
 * exactement comme avant.
 */
const STATUS_CLS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  inactive: 'bg-stone-500/10 text-stone-600 border-stone-200',
  banned: 'bg-red-500/10 text-red-700 border-red-200',
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
    <div className="overflow-hidden rounded-xl bg-card">
      <table className="w-full text-sm" data-testid="admin-users-table">
        <thead>
          <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-semibold">
              <button type="button" onClick={() => onSortClick('first_name')} className="flex items-center">
                {t('table.member')} {renderSort('first_name')}
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">{t('table.email')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.role')}</th>
            <th className="px-4 py-3 font-semibold">{t('table.status')}</th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" onClick={() => onSortClick('last_login_at')} className="flex items-center">
                {t('table.lastLogin')} {renderSort('last_login_at')}
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button type="button" onClick={() => onSortClick('created_at')} className="flex items-center">
                {t('table.createdAt')} {renderSort('created_at')}
              </button>
            </th>
            <th className="px-4 py-3 text-right font-semibold sr-only">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-muted">
          {rows.map((row) => {
            const statusCls = STATUS_CLS[row.status] ?? '';
            const statusLabel =
              STATUS_CLS[row.status] !== undefined ? t(`status.${row.status}`) : row.status;
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
                      <p className="font-semibold text-foreground">
                        {row.first_name} {row.last_name}
                      </p>
                      {isSelf ? (
                        <p className="text-xs text-muted-foreground">{t('table.you')}</p>
                      ) : null}
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <a href={`mailto:${row.email}`} className="hover:underline">
                    {row.email}
                  </a>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    // TCK-279 (AC11) — le nom de l'`AgencyRole` prime sur le
                    // TYPE de profil : deux agents de la même agence peuvent
                    // porter « Agent » et « Agent senior », et c'est
                    // exactement la distinction que cette colonne existe
                    // pour montrer depuis ce ticket.
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

                    // TCK-278 — `row.roles` peut être `string[]`
                    // (UserResource standard) ou `Array<{name}>` (vue admin
                    // détaillée). Normalise pour récupérer un label.
                    const first = row.roles?.[0];
                    const name =
                      typeof first === 'string' ? first : first?.name;
                    return name ? (
                      <Badge
                        variant="outline"
                        className="border-primary/30 bg-primary/5 text-primary"
                      >
                        {roleLabel(name)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={statusCls}>
                    {statusLabel}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(row.last_login_at, locale)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(row.created_at, locale)}</td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('table.actionsAria', {
                            name: `${row.first_name} ${row.last_name}`,
                          })}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSelect(row)}>
                        {t('table.viewDetail')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {isBlocked ? (
                        <DropdownMenuItem
                          disabled={isSelf}
                          onClick={() => onQuickAction(row, 'activate')}
                        >
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-muted px-4 py-2 text-xs text-muted-foreground">
        {t('table.count', { count: total, total: String(total) })}
      </p>
    </div>
  );
}
