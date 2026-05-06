'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ExternalLink, Loader2, MoreHorizontal } from 'lucide-react';

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
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_VISIBILITY_LABELS,
} from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';
import type { PropertyDetail } from '@/types/property';

interface Props {
  readonly property: PropertyDetail;
}

const PUBLIC_VIEWABLE_STATUSES = new Set(['available', 'published']);

export function PropertyHeaderActions({ property }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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

  const canViewPublic =
    property.visibility === 'public' &&
    property.slug &&
    property.status &&
    PUBLIC_VIEWABLE_STATUSES.has(property.status);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
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
          <DropdownMenuLabel>Visibilité</DropdownMenuLabel>
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
          <DropdownMenuItem disabled aria-disabled="true">
            Dupliquer · bientôt
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
