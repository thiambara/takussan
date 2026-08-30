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

import { DataTable, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
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
  PROPERTY_ENUM_NAMESPACES,
  enumLabel,
} from '@/components/property-form/options';
import {
  contractTypeValues,
  propertyTypeValues,
  propertyVisibilityValues,
} from '@/lib/schemas/property';
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
  const t = useTranslations('property.dashboard.list');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContract = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
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
        setBulkError(failed.message ?? t('bulkError'));
        return;
      }
      setSelectedIds([]);
      setBulkAgentId('');
      setBulkMessage(successMessage);
      router.refresh();
    });
  };

  const selectedCount = selectedIds.length;

  /**
   * Les six colonnes, dans l'ORDRE EXACT de la table faite main qu'elles remplacent
   * (sélection · bien · prix · activité · statut · actions), éprouvé par test.
   *
   * La colonne de sélection garde son en-tête à la case à cocher « tout sélectionner » : c'est
   * un CONTRÔLE, pas un libellé, donc ni `headerSrOnly` ni titre inventé.
   */
  const colonnes: readonly DataTableColumn<PropertyListItem>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          aria-label={t('selectAll')}
          checked={allVisibleSelected}
          onChange={toggleAll}
          className="size-4 rounded border-border"
        />
      ),
      className: 'w-10',
      cell: (property) => (
        <input
          type="checkbox"
          aria-label={t('selectOne', { title: property.title })}
          checked={selectedIds.includes(property.id)}
          onChange={() => toggleOne(property.id)}
          className="size-4 rounded border-border"
        />
      ),
    },
    {
      id: 'property',
      header: t('headers.property'),
      cell: (property) => <BienCell property={property} currentUserId={currentUserId} />,
    },
    { id: 'price', header: t('headers.price'), cell: (property) => <PriceCell property={property} /> },
    {
      id: 'activity',
      header: t('headers.activity'),
      cell: (property) => <ActivityCell property={property} />,
    },
    {
      id: 'status',
      header: t('headers.status'),
      cell: (property) => (
        <StatusStack status={property.status} visibility={property.visibility} />
      ),
    },
    {
      id: 'actions',
      header: t('headers.actions'),
      align: 'end',
      cell: (property) => (
        <div className="flex items-center justify-end">
          <PropertyRowActions property={property} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Table du bureau — 6 colonnes. La liste de cartes sous `md` reste des CARTES. */}
      <DataTable
        className="hidden md:block"
        caption={t('caption')}
        columns={colonnes}
        rows={properties}
        rowKey={(property) => property.id}
        rowProps={(property) => ({
          className: cn(
            'align-middle transition-colors hover:bg-muted/30',
            selectedIds.includes(property.id) && 'bg-primary/5',
          ),
        })}
        stickyHeader
      />

      {/* Mobile cards — compact horizontal layout */}
      <ul className="space-y-3 md:hidden">
        {properties.map((property) => {
          const isSelected = selectedIds.includes(property.id);
          return (
            <li
              key={property.id}
              className={cn(
                'relative flex gap-3 rounded-xl bg-card p-3 transition-colors',
                isSelected && 'ring-1 ring-inset ring-primary/30',
              )}
            >
              <div className="relative shrink-0">
                <PropertyThumbnail property={property} size={96} />
                <input
                  type="checkbox"
                  aria-label={t('selectOne', { title: property.title })}
                  checked={isSelected}
                  onChange={() => toggleOne(property.id)}
                  className="absolute left-1 top-1 size-4 rounded border-card/80 bg-card/80"
                />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <Link
                  href={`/app/properties/${property.id}`}
                  className="block truncate text-sm font-semibold text-foreground"
                >
                  {property.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {enumLabel(tType, propertyTypeValues, property.type)}
                  {property.location?.city ? ` · ${property.location.city}` : ''}
                  {property.reference_number ? ` · ${property.reference_number}` : ''}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-base font-semibold text-foreground tabular-nums">
                    {typeof property.price === 'number'
                      ? formatCurrency(property.price, 'fr', {
                          currency: property.currency ?? 'XOF',
                        })
                      : '—'}
                    {property.contract_type === 'rent' &&
                    property.rent_period ? (
                      <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                        /{RENT_PERIOD_SHORT[property.rent_period]}
                      </span>
                    ) : null}
                  </span>
                  {property.contract_type ? (
                    <span className="text-xs text-muted-foreground">
                      {enumLabel(tContract, contractTypeValues, property.contract_type)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <PropertyStatusBadge status={property.status} />
                  <VisibilityBadge visibility={property.visibility} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
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
              t('bulkArchived'),
            )
          }
          onUnpublish={() =>
            runBulk(
              (id) => updatePropertyVisibilityAction(id, 'private'),
              t('bulkUnpublished'),
            )
          }
          onAssign={() =>
            runBulk(
              (id) => assignPropertyAgentAction(id, Number(bulkAgentId)),
              t('bulkAssigned'),
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
  const t = useTranslations('property.dashboard.list');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
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
          className="block truncate text-sm font-semibold text-foreground hover:text-primary"
        >
          {property.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {enumLabel(tType, propertyTypeValues, property.type)}
          {property.location?.city ? ` · ${property.location.city}` : ''}
          {property.reference_number ? ` · ${property.reference_number}` : ''}
        </p>
        {showAgent ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            <span className="text-muted-foreground/70">{t('agentPrefix')}</span>{' '}
            <span className="font-medium text-foreground">{property.owner?.name}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PriceCell({ property }: { readonly property: PropertyListItem }) {
  const tContract = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const isRent = property.contract_type === 'rent';
  return (
    <div className="space-y-0.5">
      <div className="text-base font-semibold text-foreground tabular-nums">
        {typeof property.price === 'number'
          ? formatCurrency(property.price, 'fr', {
              currency: property.currency ?? 'XOF',
            })
          : '—'}
        {isRent && property.rent_period ? (
          <span className="ml-0.5 text-xs font-medium text-muted-foreground">
            /{RENT_PERIOD_SHORT[property.rent_period]}
          </span>
        ) : null}
      </div>
      {property.contract_type ? (
        <div className="text-xs text-muted-foreground">
          {enumLabel(tContract, contractTypeValues, property.contract_type)}
        </div>
      ) : null}
    </div>
  );
}

function ActivityCell({ property }: { readonly property: PropertyListItem }) {
  const t = useTranslations('property.dashboard.list');
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <div className="text-foreground">
        <RelativeDate value={property.created_at} />
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1" title={t('viewsTitle')}>
          <EyeIcon className="size-3" aria-hidden="true" />
          {property.views_count ?? 0}
        </span>
        <span className="inline-flex items-center gap-1" title={t('favoritesTitle')}>
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
      <PropertyStatusBadge status={status} />
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
        className="relative block shrink-0 overflow-hidden rounded-lg bg-muted"
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
      className="block shrink-0 rounded-lg bg-muted"
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

/*
 * ⚠ **Le `StatusBadge` LOCAL de ce fichier a été supprimé le 2026-08-30** (TCK-472), et le trou
 * qu'il laisse est intentionnellement bruyant : il n'y a plus rien ici qui décide la couleur d'un
 * statut de bien. Ce composant s'appelait `StatusBadge` sans être celui de `console/` — dans un
 * fichier qui définit son propre `StatusBadge`, `<StatusBadge …>` résout vers le local, et ni le
 * typage ni le lint ne le signalent. Il coloriait `sold` en `bg-success/15` là où la console était
 * passée à `/10`, parce qu'il ne lisait pas la table.
 *
 * La table `statut → ton` vit désormais dans `PropertyStatusBadge.tsx`, seule, pour la liste comme
 * pour la fiche. `scripts/check-status-badge-unique.mjs` refuse qu'un homonyme reparaisse.
 *
 * ⚠ **Un écart de comportement, assumé** : l'ancien badge faisait `status ?? 'available'` et
 * peignait donc « Disponible » sur un bien dont l'API ne servait PAS le statut. `PropertyStatusBadge`
 * ne rend rien dans ce cas. Une pastille absente est une donnée absente ; une pastille verte est
 * une affirmation.
 */

function VisibilityBadge({ visibility }: { visibility: string | null }) {
  const tVisibility = useTranslations(PROPERTY_ENUM_NAMESPACES.visibility);
  const key = visibility ?? 'private';
  const label = propertyVisibilityValues.includes(key as never)
    ? tVisibility(key)
    : (visibility ?? '—');
  const isPublic = visibility === 'public';
  return (
    <Badge
      className={cn(
        'gap-1 border-transparent text-xs',
        isPublic
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground',
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
  const t = useTranslations('property.dashboard.list');
  const items = agentOptions.map((agent) => ({
    value: String(agent.id),
    label:
      agent.id === currentUserId
        ? t('agentSelf', { name: agent.name })
        : agent.name,
  }));
  return (
    <div
      role="region"
      aria-label={t('bulkAria')}
      className="fixed inset-x-2 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-foreground/95 px-3 py-2.5 text-sm text-primary-foreground shadow-lg backdrop-blur md:inset-x-auto md:right-6"
    >
      <span className="font-semibold">
        {t('bulkSelected', { count: selectedCount })}
      </span>
      <span className="hidden h-4 w-px bg-card/20 md:inline-block" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-card/30 bg-transparent text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
        disabled={pending}
        onClick={onArchive}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        {t('bulkArchive')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-card/30 bg-transparent text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
        disabled={pending}
        onClick={onUnpublish}
      >
        {t('bulkUnpublish')}
      </Button>
      {agentOptions.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="min-w-[180px]">
            <Select
              value={bulkAgentId}
              onValueChange={(v) => setBulkAgentId((v ?? '') as string)}
              items={items}
            >
              <SelectTrigger className="h-9 border-card/30 bg-card/10 text-primary-foreground">
                <SelectValue placeholder={t('bulkReassignPlaceholder')} />
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
            className="border-card/30 bg-transparent text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
            disabled={pending || !bulkAgentId}
            onClick={onAssign}
          >
            {t('bulkAssign')}
          </Button>
        </div>
      ) : null}
      {bulkError ? (
        <span role="alert" className="text-destructive">
          {bulkError}
        </span>
      ) : null}
      {bulkMessage ? (
        <span role="status" className="text-success">
          {bulkMessage}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label={t('bulkClear')}
        className="ml-auto inline-flex size-8 items-center justify-center rounded-full text-primary-foreground/70 hover:bg-card/10 hover:text-primary-foreground"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
