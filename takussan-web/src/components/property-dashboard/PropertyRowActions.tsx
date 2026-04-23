'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2, MoreHorizontal } from 'lucide-react';

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
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_VISIBILITY_LABELS,
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

  const runAction = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? 'Action impossible. Réessayez.');
        return;
      }
      router.refresh();
    });
  };

  const toggleVisibility = () => {
    const next = property.visibility === 'public' ? 'private' : 'public';
    runAction(() => updatePropertyVisibilityAction(property.id, next));
  };

  const changeStatus = (status: string) => {
    if (status === property.status) return;
    runAction(() => updatePropertyStatusAction(property.id, status));
  };

  const confirmAndDelete = () => {
    setError(null);
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
          <DropdownMenuItem onSelect={toggleVisibility} disabled={pending}>
            {property.visibility === 'public'
              ? `Dépublier (${PROPERTY_VISIBILITY_LABELS.private})`
              : `Publier (${PROPERTY_VISIBILITY_LABELS.public})`}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Statut</DropdownMenuLabel>
          {propertyStatusValues.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={pending || status === property.status}
              onSelect={() => changeStatus(status)}
            >
              {PROPERTY_STATUS_LABELS[status]}
              {status === property.status ? ' · actuel' : ''}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmDelete(true)}
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
