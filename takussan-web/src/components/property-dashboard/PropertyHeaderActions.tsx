'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
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
  const t = useTranslations('property.dashboard.actions');
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
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
          {t('viewPublic')}
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
            <DropdownMenuItem onSelect={unpublish} disabled={pending}>
              {t('unpublish')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={publish} disabled={pending}>
              {t('publish')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={duplicate} disabled={pending}>
            <Copy className="size-4" aria-hidden="true" />
            {t('duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('statusHeading')}</DropdownMenuLabel>
          {statusActions.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={pending}
              onSelect={() => changeStatus(status)}
            >
              {tStatus(status)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {property.status !== 'archived' ? (
            <DropdownMenuItem onSelect={archive} disabled={pending}>
              <Archive className="size-4" aria-hidden="true" />
              {t('archive')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => setConfirmDelete(true)}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich('deleteBodyDetail', {
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
