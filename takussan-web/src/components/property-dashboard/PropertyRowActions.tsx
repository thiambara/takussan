'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
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
  const t = useTranslations('property.dashboard.actions');
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
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
        setError(result.message ?? t('error'));
        return;
      }
      setSuccess(successMessage);
      router.refresh();
    });
  };

  const publish = () => {
    runAction(
      () => updatePropertyVisibilityAction(property.id, 'public'),
      t('published'),
    );
  };

  const unpublish = () => {
    runAction(
      () => updatePropertyVisibilityAction(property.id, 'private'),
      t('unpublished'),
    );
  };

  const changeStatus = (status: string) => {
    if (status === property.status) return;
    runAction(
      () => updatePropertyStatusAction(property.id, status),
      t('statusUpdated'),
    );
  };

  const archive = () => {
    runAction(
      () => updatePropertyStatusAction(property.id, 'archived'),
      t('archived'),
    );
  };

  const duplicate = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await duplicatePropertyAction(property.id);
      if (!result.ok) {
        setError(result.message ?? t('duplicateFailed'));
        return;
      }
      if (!result.data) {
        setError(t('duplicateFailed'));
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
        setError(result.message ?? t('deleteFailed'));
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
        {t('edit')}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('more')}
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
          <DropdownMenuLabel>{t('quickActions')}</DropdownMenuLabel>
          {isPublic ? (
            <DropdownMenuItem onClick={unpublish} disabled={pending}>
              {t('unpublish')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={publish} disabled={pending}>
              {t('publish')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={duplicate} disabled={pending}>
            <Copy className="size-4" aria-hidden="true" />
            {t('duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('statusHeading')}</DropdownMenuLabel>
          {statusActions.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={pending}
              onClick={() => changeStatus(status)}
            >
              {tStatus(status)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {property.status !== 'archived' ? (
            <DropdownMenuItem onClick={archive} disabled={pending}>
              <Archive className="size-4" aria-hidden="true" />
              {t('archive')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich('deleteBodyRow', {
                title: property.title,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
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
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmAndDelete}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
