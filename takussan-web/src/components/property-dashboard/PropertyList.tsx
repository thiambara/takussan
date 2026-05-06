'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Archive, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';
import {
  CONTRACT_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_VISIBILITY_LABELS,
} from '@/components/property-form/options';
import {
  assignPropertyAgentAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';

import { PropertyRowActions } from './PropertyRowActions';

/**
 * Table-style list of properties for the dashboard. Server-rendered so the
 * first paint is instant; row actions live in a client island.
 */

interface PropertyListProps {
  readonly page: PaginatedResponse<PropertyListItem>;
  readonly currentUserId?: number;
  readonly agentOptions?: readonly { id: number; name: string }[];
}

export function PropertyList({
  page,
  currentUserId,
  agentOptions = [],
}: PropertyListProps) {
  const router = useRouter();
  const { data: properties, meta } = page;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAgentId, setBulkAgentId] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const visibleIds = useMemo(() => properties?.map((property) => property.id) ?? [], [properties]);

  if (!properties || properties.length === 0) {
    return <EmptyState />;
  }

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };

  const runBulk = (
    action: (id: number) => Promise<{ ok: boolean; message?: string }>,
    successMessage: string,
  ) => {
    if (selectedIds.length === 0) return;
    setBulkError(null);
    setBulkMessage(null);
    startTransition(async () => {
      const results = await Promise.all(selectedIds.map((id) => action(id)));
      const failed = results.find((result) => !result.ok);
      if (failed) {
        setBulkError(failed.message ?? 'Action en lot impossible.');
        return;
      }
      setSelectedIds([]);
      setBulkMessage(successMessage);
      router.refresh();
    });
  };

  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-4">
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-app-ink">
          <span className="font-semibold">
            {selectedCount} bien{selectedCount > 1 ? 's' : ''} sélectionné
            {selectedCount > 1 ? 's' : ''}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              runBulk(
                (id) => updatePropertyStatusAction(id, 'archived'),
                'Biens archivés.',
              )
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Archive aria-hidden="true" />}
            Archiver
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              runBulk(
                (id) => updatePropertyVisibilityAction(id, 'private'),
                'Biens dépubliés.',
              )
            }
          >
            Dépublier
          </Button>
          {agentOptions.length > 0 ? (
            <div className="flex min-w-[260px] items-center gap-2">
              <Select
                value={bulkAgentId}
                onValueChange={(value) => setBulkAgentId((value ?? '') as string)}
                items={agentOptions.map((agent) => ({
                  value: String(agent.id),
                  label: agent.id === currentUserId ? `${agent.name} (moi)` : agent.name,
                }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Réassigner à..." />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>
                      {agent.id === currentUserId ? `${agent.name} (moi)` : agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || !bulkAgentId}
                onClick={() =>
                  runBulk(
                    (id) => assignPropertyAgentAction(id, Number(bulkAgentId)),
                    'Agent assigné mis à jour.',
                  )
                }
              >
                Assigner
              </Button>
            </div>
          ) : null}
          {bulkError ? <span role="alert" className="text-destructive">{bulkError}</span> : null}
          {bulkMessage ? <span role="status" className="text-emerald-700">{bulkMessage}</span> : null}
        </div>
      ) : null}
      <div className="hidden overflow-hidden rounded-xl bg-app-surface-1 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-app-surface-2/50 text-left text-xs uppercase tracking-wide text-app-ink-muted">
              <th className="w-10 px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  aria-label="Sélectionner tous les biens"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  className="size-4 rounded border-stone-300"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Bien</th>
              <th className="px-4 py-3 font-semibold">Agent</th>
              <th className="px-4 py-3 font-semibold">Contrat</th>
              <th className="px-4 py-3 font-semibold">Prix</th>
              <th className="px-4 py-3 font-semibold">Stats</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold">Visibilité</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-surface-2">
            {properties.map((property) => (
              <tr key={property.id} className="align-middle">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${property.title}`}
                    checked={selectedIds.includes(property.id)}
                    onChange={() => toggleOne(property.id)}
                    className="size-4 rounded border-stone-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PropertyThumbnail property={property} />
                    <div className="min-w-0">
                      <Link
                        href={`/app/properties/${property.id}`}
                        className="block truncate text-sm font-semibold text-app-ink hover:text-app-topbar"
                      >
                        {property.title}
                      </Link>
                      <p className="text-xs text-app-ink-muted">
                        {PROPERTY_TYPE_LABELS[property.type] ?? property.type}
                        {property.location?.city ? ` · ${property.location.city}` : ''}
                        {property.reference_number ? ` · ${property.reference_number}` : ''}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-app-ink-muted">
                  <AgentCell property={property} currentUserId={currentUserId} />
                </td>
                <td className="px-4 py-3 text-app-ink-muted">
                  {property.contract_type
                    ? CONTRACT_TYPE_LABELS[property.contract_type]
                    : '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-app-ink">
                  {typeof property.price === 'number'
                    ? formatCurrency(property.price, 'fr', { currency: property.currency ?? 'XOF' })
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-app-ink-muted">
                  {property.views_count ?? 0} vues · {property.favorites_count ?? 0} favoris
                </td>
                <td className="px-4 py-3 text-xs text-app-ink-muted">
                  {formatDate(property.created_at)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={property.status} />
                </td>
                <td className="px-4 py-3">
                  <VisibilityBadge visibility={property.visibility} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end">
                    <PropertyRowActions property={property} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {properties.map((property) => (
          <li key={property.id} className="rounded-xl bg-app-surface-1 p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={`Sélectionner ${property.title}`}
                checked={selectedIds.includes(property.id)}
                onChange={() => toggleOne(property.id)}
                className="mt-4 size-4 rounded border-stone-300"
              />
              <PropertyThumbnail property={property} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/properties/${property.id}`}
                  className="block truncate text-sm font-semibold text-app-ink"
                >
                  {property.title}
                </Link>
                <p className="text-xs text-app-ink-muted">
                  {PROPERTY_TYPE_LABELS[property.type] ?? property.type}
                  {property.location?.city ? ` · ${property.location.city}` : ''}
                </p>
                <p className="mt-1 text-sm font-semibold text-app-ink">
                  {typeof property.price === 'number'
                    ? formatCurrency(property.price, 'fr', { currency: property.currency ?? 'XOF' })
                    : '—'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={property.status} />
              <VisibilityBadge visibility={property.visibility} />
              <span className="text-xs text-app-ink-muted">
                {formatDate(property.created_at)}
              </span>
            </div>
            <div className="mt-2 text-xs text-app-ink-muted">
              <AgentCell property={property} currentUserId={currentUserId} />
            </div>
            <div className="mt-3 flex justify-end">
              <PropertyRowActions property={property} />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-app-ink-muted">
        {meta.total} bien{meta.total > 1 ? 's' : ''} — page {meta.current_page} sur{' '}
        {meta.last_page}
      </p>
    </div>
  );
}

function PropertyThumbnail({ property }: { property: PropertyListItem }) {
  if (property.main_photo_url) {
    return (
      <span className="relative block aspect-square size-14 shrink-0 overflow-hidden rounded-lg bg-app-surface-2">
        <Image
          src={property.main_photo_url}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="block size-14 shrink-0 rounded-lg bg-app-surface-2"
    />
  );
}

function AgentCell({
  property,
  currentUserId,
}: {
  readonly property: PropertyListItem;
  readonly currentUserId?: number;
}) {
  const ownerName = property.owner?.name ?? 'Non assigné';
  const collaborators = property.collaborators ?? [];
  const isMine = currentUserId !== undefined && property.owner?.id === currentUserId;

  return (
    <div className="space-y-1">
      <p className="font-medium text-app-ink">
        {ownerName}
        {isMine ? ' · moi' : ''}
      </p>
      {collaborators.length > 0 ? (
        <p>
          {collaborators.length} collaborateur
          {collaborators.length > 1 ? 's' : ''}
        </p>
      ) : (
        <p>Aucun collaborateur</p>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-SN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string | null }) {
  const key = (status ?? 'available') as keyof typeof PROPERTY_STATUS_LABELS;
  const label = PROPERTY_STATUS_LABELS[key] ?? status ?? '—';
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-app-surface-3 bg-app-surface-2 text-app-ink',
        status === 'sold' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        status === 'rented' && 'border-blue-200 bg-blue-50 text-blue-700',
        status === 'unavailable' && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      {label}
    </Badge>
  );
}

function VisibilityBadge({ visibility }: { visibility: string | null }) {
  const key = (visibility ?? 'private') as keyof typeof PROPERTY_VISIBILITY_LABELS;
  const label = PROPERTY_VISIBILITY_LABELS[key] ?? visibility ?? '—';
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-app-surface-3 bg-app-surface-2 text-app-ink',
        visibility === 'public' && 'border-primary/30 bg-primary/5 text-primary',
      )}
    >
      {label}
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-app-surface-1 px-6 py-16 text-center">
      <div className="rounded-full bg-app-surface-2 p-4 text-app-accent">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M3 12l9-8 9 8v8a2 2 0 01-2 2h-4v-6H10v6H5a2 2 0 01-2-2v-8z" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-app-ink">Aucun bien dans votre portefeuille</p>
      <p className="max-w-md text-sm text-app-ink-muted">
        Créez votre première annonce pour la diffuser auprès des locataires et
        acheteurs Takussan.
      </p>
      <Link
        href="/app/properties/new"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Publier un bien
      </Link>
    </div>
  );
}
