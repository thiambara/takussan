'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Archive,
  EyeOff,
  Heart,
  Home,
  Loader2,
  Eye as EyeIcon,
  X,
} from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { RENT_PERIOD_SHORT } from '@/components/property/cards/types';
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
 * Dashboard property list — 6-column desktop table + compact mobile cards.
 * Server-rendered for instant first paint; row actions and bulk operations
 * live in client islands. Bulk actions surface in a sticky bottom toolbar
 * once at least one row is selected.
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
  const searchParams = useSearchParams();
  const { data: properties } = page;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAgentId, setBulkAgentId] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const visibleIds = useMemo(
    () => properties?.map((property) => property.id) ?? [],
    [properties],
  );

  const hasActiveFilters = useMemo(
    () => Array.from(searchParams.keys()).some((k) => k !== 'page' && k !== 'sort' && k !== 'per_page'),
    [searchParams],
  );

  if (!properties || properties.length === 0) {
    return hasActiveFilters ? (
      <PortfolioFilteredEmpty onReset={() => router.replace('?')} />
    ) : (
      <PortfolioEmpty />
    );
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
      setBulkAgentId('');
      setBulkMessage(successMessage);
      router.refresh();
    });
  };

  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-4">
      {/* Desktop table — 6 columns */}
      <div className="hidden overflow-hidden rounded-xl bg-app-surface-1 md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-app-surface-2/70 backdrop-blur">
            <tr className="text-left text-xs uppercase tracking-wide text-app-ink-muted">
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
              <th className="px-4 py-3 font-semibold">Prix</th>
              <th className="px-4 py-3 font-semibold">Activité</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-surface-2/60">
            {properties.map((property) => (
              <tr
                key={property.id}
                className={cn(
                  'align-middle transition-colors hover:bg-app-surface-2/30',
                  selectedIds.includes(property.id) && 'bg-app-accent/5',
                )}
              >
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${property.title}`}
                    checked={selectedIds.includes(property.id)}
                    onChange={() => toggleOne(property.id)}
                    className="size-4 rounded border-stone-300"
                  />
                </td>
                <td className="px-4 py-4">
                  <BienCell property={property} currentUserId={currentUserId} />
                </td>
                <td className="px-4 py-4">
                  <PriceCell property={property} />
                </td>
                <td className="px-4 py-4">
                  <ActivityCell property={property} />
                </td>
                <td className="px-4 py-4">
                  <StatusStack
                    status={property.status}
                    visibility={property.visibility}
                  />
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end">
                    <PropertyRowActions property={property} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — compact horizontal layout */}
      <ul className="space-y-3 md:hidden">
        {properties.map((property) => {
          const isSelected = selectedIds.includes(property.id);
          return (
            <li
              key={property.id}
              className={cn(
                'relative flex gap-3 rounded-xl bg-app-surface-1 p-3 transition-colors',
                isSelected && 'ring-1 ring-inset ring-app-accent/30',
              )}
            >
              <div className="relative shrink-0">
                <PropertyThumbnail property={property} size={96} />
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${property.title}`}
                  checked={isSelected}
                  onChange={() => toggleOne(property.id)}
                  className="absolute left-1 top-1 size-4 rounded border-white/80 bg-white/80"
                />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <Link
                  href={`/app/properties/${property.id}`}
                  className="block truncate text-sm font-semibold text-app-ink"
                >
                  {property.title}
                </Link>
                <p className="truncate text-xs text-app-ink-muted">
                  {PROPERTY_TYPE_LABELS[property.type] ?? property.type}
                  {property.location?.city ? ` · ${property.location.city}` : ''}
                  {property.reference_number ? ` · ${property.reference_number}` : ''}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-base font-semibold text-app-ink tabular-nums">
                    {typeof property.price === 'number'
                      ? formatCurrency(property.price, 'fr', {
                          currency: property.currency ?? 'XOF',
                        })
                      : '—'}
                    {property.contract_type === 'rent' &&
                    property.rent_period ? (
                      <span className="ml-0.5 text-xs font-medium text-app-ink-muted">
                        /{RENT_PERIOD_SHORT[property.rent_period]}
                      </span>
                    ) : null}
                  </span>
                  {property.contract_type ? (
                    <span className="text-xs text-app-ink-muted">
                      {CONTRACT_TYPE_LABELS[property.contract_type]}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={property.status} />
                  <VisibilityBadge visibility={property.visibility} />
                </div>
                <p className="mt-2 text-xs text-app-ink-muted">
                  <RelativeDate value={property.created_at} /> ·{' '}
                  <span className="inline-flex items-center gap-1">
                    <EyeIcon className="size-3" aria-hidden="true" />
                    {property.views_count ?? 0}
                  </span>{' '}
                  ·{' '}
                  <span className="inline-flex items-center gap-1">
                    <Heart className="size-3" aria-hidden="true" />
                    {property.favorites_count ?? 0}
                  </span>
                  {currentUserId !== undefined &&
                  property.owner &&
                  property.owner.id !== currentUserId
                    ? ` · ${property.owner.name}`
                    : ''}
                </p>
              </div>
              <div className="absolute right-2 top-2">
                <PropertyRowActions property={property} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Sticky bulk actions toolbar */}
      {selectedCount > 0 ? (
        <BulkActionBar
          selectedCount={selectedCount}
          pending={pending}
          bulkError={bulkError}
          bulkMessage={bulkMessage}
          bulkAgentId={bulkAgentId}
          setBulkAgentId={setBulkAgentId}
          agentOptions={agentOptions}
          currentUserId={currentUserId}
          onArchive={() =>
            runBulk(
              (id) => updatePropertyStatusAction(id, 'archived'),
              'Biens archivés.',
            )
          }
          onUnpublish={() =>
            runBulk(
              (id) => updatePropertyVisibilityAction(id, 'private'),
              'Biens dépubliés.',
            )
          }
          onAssign={() =>
            runBulk(
              (id) => assignPropertyAgentAction(id, Number(bulkAgentId)),
              'Agent assigné mis à jour.',
            )
          }
          onClear={() => {
            setSelectedIds([]);
            setBulkAgentId('');
            setBulkError(null);
            setBulkMessage(null);
          }}
        />
      ) : null}
    </div>
  );
}

function BienCell({
  property,
  currentUserId,
}: {
  readonly property: PropertyListItem;
  readonly currentUserId?: number;
}) {
  const showAgent =
    currentUserId !== undefined &&
    property.owner &&
    property.owner.id !== currentUserId;
  return (
    <div className="flex items-center gap-3">
      <PropertyThumbnail property={property} />
      <div className="min-w-0">
        <Link
          href={`/app/properties/${property.id}`}
          className="block truncate text-sm font-semibold text-app-ink hover:text-app-accent"
        >
          {property.title}
        </Link>
        <p className="truncate text-xs text-app-ink-muted">
          {PROPERTY_TYPE_LABELS[property.type] ?? property.type}
          {property.location?.city ? ` · ${property.location.city}` : ''}
          {property.reference_number ? ` · ${property.reference_number}` : ''}
        </p>
        {showAgent ? (
          <p className="mt-1 truncate text-xs text-app-ink-muted">
            <span className="text-app-ink-muted/70">Agent :</span>{' '}
            <span className="font-medium text-app-ink">{property.owner?.name}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PriceCell({ property }: { readonly property: PropertyListItem }) {
  const isRent = property.contract_type === 'rent';
  return (
    <div className="space-y-0.5">
      <div className="text-base font-semibold text-app-ink tabular-nums">
        {typeof property.price === 'number'
          ? formatCurrency(property.price, 'fr', {
              currency: property.currency ?? 'XOF',
            })
          : '—'}
        {isRent && property.rent_period ? (
          <span className="ml-0.5 text-xs font-medium text-app-ink-muted">
            /{RENT_PERIOD_SHORT[property.rent_period]}
          </span>
        ) : null}
      </div>
      {property.contract_type ? (
        <div className="text-xs text-app-ink-muted">
          {CONTRACT_TYPE_LABELS[property.contract_type]}
        </div>
      ) : null}
    </div>
  );
}

function ActivityCell({ property }: { readonly property: PropertyListItem }) {
  return (
    <div className="space-y-0.5 text-xs text-app-ink-muted">
      <div className="text-app-ink">
        <RelativeDate value={property.created_at} />
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1" title="Vues">
          <EyeIcon className="size-3" aria-hidden="true" />
          {property.views_count ?? 0}
        </span>
        <span className="inline-flex items-center gap-1" title="Favoris">
          <Heart className="size-3" aria-hidden="true" />
          {property.favorites_count ?? 0}
        </span>
      </div>
    </div>
  );
}

function StatusStack({
  status,
  visibility,
}: {
  readonly status: string | null;
  readonly visibility: string | null;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={status} />
      <VisibilityBadge visibility={visibility} />
    </div>
  );
}

function PropertyThumbnail({
  property,
  size = 56,
}: {
  readonly property: PropertyListItem;
  readonly size?: number;
}) {
  const dim = `${size}px`;
  if (property.main_photo_url) {
    return (
      <span
        className="relative block shrink-0 overflow-hidden rounded-lg bg-app-surface-2"
        style={{ width: dim, height: dim }}
      >
        <Image
          src={property.main_photo_url}
          alt=""
          fill
          sizes={dim}
          className="object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-lg bg-app-surface-2"
      style={{ width: dim, height: dim }}
    />
  );
}

function RelativeDate({ value }: { readonly value: string }) {
  // Two-stage render avoids hydration mismatch: SSR + first client render show
  // the absolute date, then the relative form is computed after mount where
  // reading the current clock is safe.
  const date = useMemo(() => new Date(value), [value]);
  const absolute = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-SN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date),
    [date],
  );
  // TCK-316 — `useSyncExternalStore` est la primitive prévue par React pour
  // « cette valeur diffère entre le serveur et le client » : instantané serveur
  // `null` (on peint l'absolu), instantané client calculé après hydratation.
  // Elle remplace le couple `useState` + `useEffect` sans dérogation à la règle,
  // et surtout sans le rendu en cascade que celui-ci provoquait pour CHAQUE
  // ligne de la liste.
  //
  // ⚠️ L'instantané est mémoïsé par `date` : `formatRelative` lit l'horloge, et
  // un `getSnapshot` qui rend une chaîne différente à chaque appel ferait
  // re-rendre React en boucle. Mémoïsé, il reproduit exactement l'ancien
  // comportement — recalculé quand `date` change, et seulement alors.
  const getRelative = useMemo(() => {
    let cached: string | null = null;
    return (): string => (cached ??= formatRelative(date));
  }, [date]);
  const relative = useSyncExternalStore(subscribeToNothing, getRelative, () => null);

  return (
    <time dateTime={date.toISOString()} title={absolute}>
      {relative ?? absolute}
    </time>
  );
}

/**
 * Abonnement inerte pour `useSyncExternalStore` : la valeur relative ne change
 * pas d'elle-même après le montage (elle est recalculée quand `date` change,
 * comme avant). Déclaré au module et NON en ligne : une fonction recréée à
 * chaque rendu ferait se réabonner React à chaque rendu.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

function formatRelative(date: Date): string {
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (absSec < 60) return rtf.format(diffSec, 'second');
  if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (absSec < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (absSec < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
}

function StatusBadge({ status }: { status: string | null }) {
  const key = (status ?? 'available') as keyof typeof PROPERTY_STATUS_LABELS;
  const label = PROPERTY_STATUS_LABELS[key] ?? status ?? '—';
  return (
    <Badge
      className={cn(
        'border-transparent bg-app-surface-2 text-app-ink',
        status === 'available' && 'bg-emerald-50 text-emerald-700',
        status === 'sold' && 'bg-emerald-100 text-emerald-800',
        status === 'rented' && 'bg-blue-50 text-blue-700',
        status === 'unavailable' && 'bg-red-50 text-red-700',
        status === 'pending' && 'bg-amber-50 text-amber-700',
        status === 'under_maintenance' && 'bg-orange-50 text-orange-700',
        status === 'archived' && 'bg-stone-100 text-stone-600',
      )}
    >
      {label}
    </Badge>
  );
}

function VisibilityBadge({ visibility }: { visibility: string | null }) {
  const key = (visibility ?? 'private') as keyof typeof PROPERTY_VISIBILITY_LABELS;
  const label = PROPERTY_VISIBILITY_LABELS[key] ?? visibility ?? '—';
  const isPublic = visibility === 'public';
  return (
    <Badge
      className={cn(
        'gap-1 border-transparent text-xs',
        isPublic
          ? 'bg-app-accent/10 text-app-accent'
          : 'bg-app-surface-2 text-app-ink-muted',
      )}
    >
      {isPublic ? (
        <EyeIcon aria-hidden="true" className="size-3" />
      ) : (
        <EyeOff aria-hidden="true" className="size-3" />
      )}
      {label}
    </Badge>
  );
}

function PortfolioEmpty() {
  const t = useTranslations('property.portfolio');
  return (
    <EmptyState
      icon={<Home className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
      action={
        <Link href="/app/properties/new" className={buttonVariants()}>
          {t('empty_cta')}
        </Link>
      }
    />
  );
}

function PortfolioFilteredEmpty({ onReset }: { readonly onReset: () => void }) {
  const t = useTranslations('property.portfolio');
  return (
    <EmptyState
      icon={<Home className="size-8" aria-hidden="true" />}
      title={t('filtered_empty_title')}
      description={t('filtered_empty_description')}
      action={
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          {t('filtered_empty_cta')}
        </Button>
      }
    />
  );
}

function BulkActionBar({
  selectedCount,
  pending,
  bulkError,
  bulkMessage,
  bulkAgentId,
  setBulkAgentId,
  agentOptions,
  currentUserId,
  onArchive,
  onUnpublish,
  onAssign,
  onClear,
}: {
  readonly selectedCount: number;
  readonly pending: boolean;
  readonly bulkError: string | null;
  readonly bulkMessage: string | null;
  readonly bulkAgentId: string;
  readonly setBulkAgentId: (v: string) => void;
  readonly agentOptions: readonly { id: number; name: string }[];
  readonly currentUserId?: number;
  readonly onArchive: () => void;
  readonly onUnpublish: () => void;
  readonly onAssign: () => void;
  readonly onClear: () => void;
}) {
  const items = agentOptions.map((agent) => ({
    value: String(agent.id),
    label: agent.id === currentUserId ? `${agent.name} (moi)` : agent.name,
  }));
  return (
    <div
      role="region"
      aria-label="Actions groupées"
      className="fixed inset-x-2 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-app-topbar/95 px-3 py-2.5 text-sm text-white shadow-lg backdrop-blur md:inset-x-auto md:right-6"
    >
      <span className="font-semibold">
        {selectedCount} bien{selectedCount > 1 ? 's' : ''} sélectionné
        {selectedCount > 1 ? 's' : ''}
      </span>
      <span className="hidden h-4 w-px bg-white/20 md:inline-block" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
        disabled={pending}
        onClick={onArchive}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        Archiver
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
        disabled={pending}
        onClick={onUnpublish}
      >
        Dépublier
      </Button>
      {agentOptions.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="min-w-[180px]">
            <Select
              value={bulkAgentId}
              onValueChange={(v) => setBulkAgentId((v ?? '') as string)}
              items={items}
            >
              <SelectTrigger className="h-9 border-white/30 bg-white/10 text-white">
                <SelectValue placeholder="Réassigner à…" />
              </SelectTrigger>
              <SelectContent>
                {items.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            disabled={pending || !bulkAgentId}
            onClick={onAssign}
          >
            Assigner
          </Button>
        </div>
      ) : null}
      {bulkError ? (
        <span role="alert" className="text-red-200">
          {bulkError}
        </span>
      ) : null}
      {bulkMessage ? (
        <span role="status" className="text-emerald-200">
          {bulkMessage}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label="Tout désélectionner"
        className="ml-auto inline-flex size-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
