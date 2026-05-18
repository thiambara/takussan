'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { postUserAction } from '@/lib/queries/admin-users';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import { ApiError } from '@/lib/api';

interface UserDetailDrawerProps {
  user: AdminAgencyUserRow | null;
  currentUserId: number;
  onOpenChange: (open: boolean) => void;
  onRemove?: (user: AdminAgencyUserRow) => void;
  isRemoving?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  banned: 'Bloqué',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
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
}: UserDetailDrawerProps) {
  const queryClient = useQueryClient();

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
                  {STATUS_LABEL[user.status] ?? user.status}
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
                <Field label="Téléphone" value={user.phone ?? '—'} />
                <Field label="Dernière connexion" value={formatDate(user.last_login_at)} />
                <Field label="Compte créé" value={formatDate(user.created_at)} />
              </dl>

              <Separator className="my-5" />

              <UserRolesEditor user={user} />
            </div>

            <div className="border-t border-app-surface-2 p-6">
              {lastError ? (
                <p className="mb-3 text-xs text-destructive" role="alert">
                  {lastError.displayMessage}
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
                    Réactiver le compte
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
                    Bloquer le compte
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
                    Retirer de l&apos;agence
                  </Button>
                ) : null}
              </div>
              {isSelf ? (
                <p className="mt-2 text-center text-xs text-app-ink-muted">
                  Vous ne pouvez pas modifier le statut de votre propre compte.
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
