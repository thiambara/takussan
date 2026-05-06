'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Archive,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
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
import type { PropertyDetail } from '@/types/property';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  readonly property: PropertyDetail;
}

const PUBLIC_VIEWABLE_STATUSES = new Set(['available', 'published']);

export function PropertyHeaderActions({ property }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      router.push('/app/properties');
      router.refresh();
    });
  };

  const canViewPublic =
    property.visibility === 'public' &&
    property.slug &&
    property.status &&
    PUBLIC_VIEWABLE_STATUSES.has(property.status);
  const isPublic = property.visibility === 'public';
  const statusActions = propertyStatusValues.filter(
    (status) =>
      status !== property.status &&
      status !== 'draft' &&
      status !== 'archived',
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
      {success ? (
        <span role="status" className="text-xs text-emerald-700">
          {success}
        </span>
      ) : null}
      {canViewPublic ? (
        <Link
          href={`/properties/${property.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ExternalLink aria-hidden="true" />
          Voir la fiche publique
        </Link>
      ) : null}
      <AddDocumentButton
        documentableType="property"
        documentableId={property.id}
        displayLabel={property.title}
      />
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
            <DropdownMenuItem onSelect={unpublish} disabled={pending}>
              Dépublier
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={publish} disabled={pending}>
              Publier
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={duplicate} disabled={pending}>
            <Copy className="size-4" aria-hidden="true" />
            Dupliquer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Statut</DropdownMenuLabel>
          {statusActions.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={pending}
              onSelect={() => changeStatus(status)}
            >
              {PROPERTY_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {property.status !== 'archived' ? (
            <DropdownMenuItem onSelect={archive} disabled={pending}>
              <Archive className="size-4" aria-hidden="true" />
              Archiver
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => setConfirmDelete(true)}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce bien ?</DialogTitle>
            <DialogDescription>
              Le bien <strong>{property.title}</strong> sera supprimé de votre
              portefeuille agent. L'enregistrement reste restaurable côté
              administration.
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
