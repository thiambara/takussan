'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Archive, Copy, Loader2, MoreHorizontal } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deletePropertyAction,
  duplicatePropertyAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import {
  PROPERTY_STATUS_LABELS,
} from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';
import type { PropertyListItem } from '@/types/property';

/**
 * Quick-action menu for a row in the dashboard property list.
 * Backs TCK-041 AC "les actions rapides (statut, visibilité) fonctionnent
 * sans recharger la page". Uses `startTransition` so the row stays
 * interactive while the mutation is in flight, and calls `router.refresh()`
 * to invalidate the RSC tree server-side without a full navigation.
 */

export function PropertyRowActions({ property }: { property: PropertyListItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runAction = (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    successMessage: string,
  ) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? 'Action impossible. Réessayez.');
        return;
      }
      setSuccess(successMessage);
      router.refresh();
    });
  };

  const publish = () => {
    runAction(
      () => updatePropertyVisibilityAction(property.id, 'public'),
      'Bien publié.',
    );
  };

  const unpublish = () => {
    runAction(
      () => updatePropertyVisibilityAction(property.id, 'private'),
      'Bien dépublié.',
    );
  };

  const changeStatus = (status: string) => {
    if (status === property.status) return;
    runAction(
      () => updatePropertyStatusAction(property.id, status),
      'Statut mis à jour.',
    );
  };

  const archive = () => {
    runAction(
      () => updatePropertyStatusAction(property.id, 'archived'),
      'Bien archivé.',
    );
  };

  const duplicate = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await duplicatePropertyAction(property.id);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'Duplication impossible.');
        return;
      }
      router.push(`/app/properties/${result.data.id}`);
      router.refresh();
    });
  };

  const confirmAndDelete = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deletePropertyAction(property.id);
      if (!result.ok) {
        setError(result.message ?? 'Suppression impossible.');
        return;
      }
      setConfirmDelete(false);
      router.refresh();
    });
  };

  const isPublic = property.visibility === 'public';
  const statusActions = propertyStatusValues.filter(
    (status) =>
      status !== property.status &&
      status !== 'draft' &&
      status !== 'archived',
  );

  return (
    <div className="flex items-center gap-1">
      {error ? (
        <span
          role="alert"
          className="mr-2 hidden truncate text-xs text-destructive md:inline"
        >
          {error}
        </span>
      ) : null}
      {success ? (
        <span
          role="status"
          className="mr-2 hidden truncate text-xs text-emerald-700 md:inline"
        >
          {success}
        </span>
      ) : null}
      <Link
        href={`/app/properties/${property.id}`}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        aria-disabled={pending}
      >
        Modifier
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Plus d’actions"
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <MoreHorizontal aria-hidden="true" />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions rapides</DropdownMenuLabel>
          {isPublic ? (
            <DropdownMenuItem onClick={unpublish} disabled={pending}>
              Dépublier
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={publish} disabled={pending}>
              Publier
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={duplicate} disabled={pending}>
            <Copy className="size-4" aria-hidden="true" />
            Dupliquer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Statut</DropdownMenuLabel>
          {statusActions.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={pending}
              onClick={() => changeStatus(status)}
            >
              {PROPERTY_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {property.status !== 'archived' ? (
            <DropdownMenuItem onClick={archive} disabled={pending}>
              <Archive className="size-4" aria-hidden="true" />
              Archiver
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce bien ?</DialogTitle>
            <DialogDescription>
              Le bien <strong>{property.title}</strong> sera archivé
              (soft-delete). Vous pourrez le restaurer depuis
              l’administration.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={confirmAndDelete}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
