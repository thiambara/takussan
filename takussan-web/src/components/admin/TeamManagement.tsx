'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import {
  MoreHorizontal,
  UserPlus,
  Shield,
  ShieldCheck,
  Trash2,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  fetchAgencyMembers,
  updateAgencyMemberRole,
  removeAgencyMember,
  type AgencyMemberRole,
} from '@/lib/queries/agency-members';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InviteMemberDialog } from './InviteMemberDialog';
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import { ApiError } from '@/lib/api';
import type { User } from '@/types/user';

interface TeamManagementProps {
  readonly agencyId: number;
  readonly currentUserId: number;
}

const ROLE_LABEL: Record<string, string> = {
  agent: 'Agent',
  agency_admin: 'Administrateur',
  admin: 'Administrateur',
  super_admin: 'Super admin',
  owner: 'Propriétaire',
  customer: 'Client',
};

function getInitials(user: User): string {
  return `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase();
}

function getPrimaryManagedRole(user: User): AgencyMemberRole {
  if (user.roles.includes('agency_admin')) return 'agency_admin';
  return 'agent';
}

export function TeamManagement({ agencyId, currentUserId }: TeamManagementProps) {
  const { token } = useAuth();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AgencyMemberRole | ''>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryKey = ['agency-members', agencyId, { search, role: roleFilter }];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () =>
      fetchAgencyMembers(agencyId, token ?? '', {
        filters: {
          search: search || undefined,
          role: roleFilter || undefined,
        },
      }),
    enabled: Boolean(token),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: AgencyMemberRole }) =>
      updateAgencyMemberRole(agencyId, userId, role, token ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.displayMessage : 'Une erreur est survenue.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeAgencyMember(agencyId, userId, token ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setRemoving(null);
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.displayMessage : 'Une erreur est survenue.');
    },
  });

  const members = data?.data ?? [];
  const agencyAdminCount = members.filter((m) => m.roles.includes('agency_admin')).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <input
            type="search"
            placeholder="Rechercher un membre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 max-w-sm rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as AgencyMemberRole | '')}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Filtrer par rôle"
          >
            <option value="">Tous les rôles</option>
            <option value="agent">Agents</option>
            <option value="agency_admin">Administrateurs</option>
          </select>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Inviter un agent
        </Button>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-app-surface-1">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-app-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Chargement des membres…
          </div>
        ) : isError ? (
          <div className="p-8 text-sm text-destructive">
            Impossible de charger la liste des membres.
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Shield className="size-8 text-app-accent" />
            <p className="text-sm font-semibold text-app-ink">
              Aucun membre pour l&apos;instant
            </p>
            <p className="max-w-md text-xs text-app-ink-muted">
              Invitez votre équipe pour commencer à collaborer sur vos biens.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-app-surface-2/50 text-left text-xs uppercase tracking-wide text-app-ink-muted">
                <th className="px-4 py-3 font-semibold">Membre</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Rôle</th>
                <th className="px-4 py-3 font-semibold">Ajouté le</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-surface-2">
              {members.map((member) => {
                const primaryRole = getPrimaryManagedRole(member);
                const isSelf = member.id === currentUserId;
                const isLastAgencyAdmin =
                  primaryRole === 'agency_admin' && agencyAdminCount <= 1;
                return (
                  <tr key={member.id} data-testid={`team-row-${member.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {member.avatar_url ? (
                            <AvatarImage src={member.avatar_url} alt={member.full_name} />
                          ) : null}
                          <AvatarFallback>{getInitials(member)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-app-ink">
                            {member.full_name || `${member.first_name} ${member.last_name}`}
                          </p>
                          {isSelf ? (
                            <p className="text-xs text-app-ink-muted">Vous</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-app-ink-muted">
                      <a href={`mailto:${member.email}`} className="hover:underline">
                        {member.email}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={primaryRole} />
                    </td>
                    <td className="px-4 py-3 text-app-ink-muted">
                      {new Date(member.created_at).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions pour ${member.full_name}`}
                              disabled={roleMutation.isPending || removeMutation.isPending}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {primaryRole === 'agent' ? (
                            <DropdownMenuItem
                              onClick={() =>
                                roleMutation.mutate({
                                  userId: member.id,
                                  role: 'agency_admin',
                                })
                              }
                            >
                              <ShieldCheck className="size-4" />
                              Promouvoir administrateur
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={isLastAgencyAdmin}
                              onClick={() =>
                                roleMutation.mutate({
                                  userId: member.id,
                                  role: 'agent',
                                })
                              }
                            >
                              <Shield className="size-4" />
                              Rétrograder en agent
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={isSelf || isLastAgencyAdmin}
                            onClick={() => setRemoving(member)}
                          >
                            <Trash2 className="size-4" />
                            Retirer de l&apos;agence
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {data?.meta ? (
        <p className="text-xs text-app-ink-muted">
          {data.meta.total} membre{data.meta.total > 1 ? 's' : ''}
        </p>
      ) : null}

      <InviteMemberDialog
        agencyId={agencyId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey })}
      />

      <ConfirmRemoveDialog
        member={removing}
        onCancel={() => setRemoving(null)}
        onConfirm={(member) => removeMutation.mutate(member.id)}
        isPending={removeMutation.isPending}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABEL[role] ?? role;
  const isAdmin = role === 'agency_admin' || role === 'admin' || role === 'super_admin';
  return (
    <Badge
      variant="outline"
      className={
        isAdmin
          ? 'border-primary/30 bg-primary/5 text-primary'
          : 'border-app-surface-3 bg-app-surface-2 text-app-ink'
      }
    >
      {label}
    </Badge>
  );
}
