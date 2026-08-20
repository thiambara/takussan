'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { UserRolesEditor } from './UserRolesEditor';
import { MemberAgencyRoleSelect } from '@/components/admin/roles/MemberAgencyRoleSelect';
import { postUserAction } from '@/lib/queries/admin-users';
import { formatDate as formatDateIntl } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';
import { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface UserDetailDrawerProps {
  user: AdminAgencyUserRow | null;
  currentUserId: number;
  onOpenChange: (open: boolean) => void;
  onRemove?: (user: AdminAgencyUserRow) => void;
  isRemoving?: boolean;
  /** TCK-279 — l'agence dont on administre l'équipe. */
  agencyId?: number;
  /**
   * TCK-279 (AC11) — les profils de ce membre DANS cette agence, avec le
   * rôle que chacun porte. Une LISTE : rien n'interdit d'être agent et
   * propriétaire dans la même agence, et ces deux profils ont chacun leur
   * rôle. Un sélecteur par profil, donc.
   */
  assignments?: readonly AgencyRoleAssignment[];
  /**
   * AC12 — `team.assign_role`, résolu par capacité et non par type de
   * profil. ⚠️ Masquer le sélecteur n'autorise rien : `AgencyRolePolicy`
   * décide, ceci évite seulement d'offrir un geste qui rendra 403.
   */
  canAssignRole?: boolean;
}

/** TCK-292 — libellés résolus sous `admin.users.status.*` ; une valeur inconnue
 * du dictionnaire retombe sur la valeur brute de l'API, comme auparavant. */
const KNOWN_STATUSES = new Set(['active', 'inactive', 'banned']);

/** TCK-292 — la locale ACTIVE, plus `fr-FR` en dur (options inchangées). */
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

function getInitials(u: AdminAgencyUserRow): string {
  return `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '·';
}

/**
 * TCK-133 — slide-in detail panel for a single user. Houses the role
 * editor and the activate/block toggle. Uses the shared `Sheet` (base-ui
 * dialog) so the focus trap and ESC handling are inherited.
 */
export function UserDetailDrawer({
  user,
  currentUserId,
  onOpenChange,
  onRemove,
  isRemoving = false,
  agencyId,
  assignments = [],
  canAssignRole = false,
}: UserDetailDrawerProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('admin.users');
  const locale = useLocale() as Locale;
  const agencyRoleHeading = useTranslations('admin.roles')('assign.heading');
  const messageErreur = useMessageErreurApi();

  const blockMutation = useMutation({
    mutationFn: () => postUserAction(user!.id, 'block'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] });
      onOpenChange(false);
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => postUserAction(user!.id, 'activate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] });
      onOpenChange(false);
    },
  });

  const isPending = blockMutation.isPending || activateMutation.isPending;
  const lastError = (blockMutation.error ?? activateMutation.error) as ApiError | null;
  const isSelf = user?.id === currentUserId;
  const isBlocked = user?.status === 'banned';

  return (
    <Sheet open={user !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md p-0 sm:max-w-md"
      >
        {user ? (
          <div key={user.id} className="flex h-full flex-col">
            <SheetHeader className="space-y-2 border-b border-app-surface-2 p-6">
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarFallback>{getInitials(user)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="truncate text-lg">
                    {user.first_name} {user.last_name}
                  </SheetTitle>
                  <SheetDescription className="truncate">{user.email}</SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {KNOWN_STATUSES.has(user.status) ? t(`status.${user.status}`) : user.status}
                </Badge>
                {user.roles?.map((r) => {
                  // TCK-278 — l'API peut retourner soit une string (UserResource)
                  // soit `{name}` (UserDetailResource). Normalise.
                  const name = typeof r === 'string' ? r : r.name;
                  return (
                    <Badge key={name} variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                      {name}
                    </Badge>
                  );
                })}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <Field label={t('drawer.phone')} value={user.phone ?? '—'} />
                <Field label={t('drawer.lastLogin')} value={formatDate(user.last_login_at, locale)} />
                <Field label={t('drawer.createdAt')} value={formatDate(user.created_at, locale)} />
              </dl>

              <Separator className="my-5" />

              <UserRolesEditor user={user} />

              {canAssignRole && typeof agencyId === 'number' && assignments.length > 0 ? (
                <>
                  <Separator className="my-5" />
                  <div className="space-y-4" data-testid="member-agency-roles">
                    <p className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">
                      {agencyRoleHeading}
                    </p>
                    {assignments.map((assignment) => (
                      <MemberAgencyRoleSelect
                        key={`${assignment.profile_type}-${assignment.profile_id}`}
                        agencyId={agencyId}
                        assignment={assignment}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="border-t border-app-surface-2 p-6">
              {lastError ? (
                <p className="mb-3 text-xs text-destructive" role="alert">
                  {messageErreur(lastError)}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {isBlocked ? (
                  <Button
                    className="w-full"
                    disabled={isPending || isSelf}
                    onClick={() => activateMutation.mutate()}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    {t('drawer.reactivateAccount')}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant="destructive"
                    disabled={isPending || isSelf}
                    onClick={() => blockMutation.mutate()}
                    data-testid="block-user-button"
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    {t('drawer.blockAccount')}
                  </Button>
                )}
                {onRemove ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={isRemoving || isSelf}
                    onClick={() => onRemove(user)}
                    data-testid="remove-user-button"
                  >
                    {isRemoving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    {t('drawer.removeFromAgency')}
                  </Button>
                ) : null}
              </div>
              {isSelf ? (
                <p className="mt-2 text-center text-xs text-app-ink-muted">
                  {t('drawer.selfNotice')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs uppercase tracking-wide text-app-ink-muted">{label}</dt>
      <dd className="truncate text-sm text-app-ink">{value}</dd>
    </div>
  );
}
