'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { DoorOpen, Loader2, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { MediaDropzone } from '@/components/media';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useDeleteInventoryRoomPhoto,
  useDisputeInventory,
  useInventory,
  useSubmitInventory,
  useUploadInventoryRoomPhotos,
} from '@/lib/queries/inventory';
import type { Inventory, InventoryRoomPhoto } from '@/types/inventory';

/**
 * TCK-596 — le plafond de l'API (`UploadRoomPhotosInventoryRequest` : `max:5120` Ko). La zone
 * l'affiche et réduit chaque photo jusque sous lui avant de valider : une photo de téléphone plus
 * lourde passe, réduite, au lieu d'être refusée.
 */
export const INVENTORY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

import {
  InventoryElementStateBadge,
  InventoryStatusBadge,
  InventoryTypeBadge,
} from './InventoryBadges';
import { InventorySignatures } from './InventorySignatures';
import { InventoryPdfButton } from './InventoryPdfButton';

export function InventoryDetail({ id }: { readonly id: number }) {
  const query = useInventory(id);

  return (
    <QueryBoundary query={query}>
      {(payload) => <InventoryBody inventory={payload.data} />}
    </QueryBoundary>
  );
}

function InventoryBody({ inventory }: { readonly inventory: Inventory }) {
  const t = useTranslations('inventory.detail');
  const tRoot = useTranslations('inventory');
  const tLease = useTranslations('lease');
  const tConditions = useTranslations('inventory.conditions');
  const locale = useLocale() as Locale;
  const isDraft = inventory.status === 'draft';

  return (
    <div className="space-y-6">
      <header className="rounded-xl bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight text-balance text-foreground">
              {inventory.property?.title ?? tRoot('fallbackReference', { id: String(inventory.id) })}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {inventory.property?.slug ? (
                <Link
                  href={`/properties/${inventory.property.slug}`}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t('viewProperty')}
                </Link>
              ) : (
                <>{t('propertyFallback', { id: String(inventory.property_id) })}</>
              )}
              {' · '}
              <Link
                href={`/app/leases/${inventory.lease_id}`}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {inventory.lease?.reference_number ?? tLease('fallbackReference', { id: String(inventory.lease_id) })}
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InventoryTypeBadge type={inventory.type} />
            <InventoryStatusBadge status={inventory.status} />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-muted-foreground tabular-nums lg:grid-cols-4">
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('generalCondition')}</dt>
            <dd className="mt-0.5 text-foreground">
              {tConditions(inventory.general_condition)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('conductedAt')}</dt>
            <dd className="mt-0.5 text-foreground">
              {inventory.conducted_at ? formatDateTime(inventory.conducted_at, locale) : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('tenant')}</dt>
            <dd className="mt-0.5 text-foreground">
              {inventory.tenant_signed && inventory.tenant_signed_at
                ? t('signedOn', { date: formatDateTime(inventory.tenant_signed_at, locale) })
                : t('pending')}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('landlord')}</dt>
            <dd className="mt-0.5 text-foreground">
              {inventory.owner_signed && inventory.owner_signed_at
                ? t('signedOn', { date: formatDateTime(inventory.owner_signed_at, locale) })
                : t('pending')}
            </dd>
          </div>
        </dl>

        {inventory.notes ? (
          <p className="mt-4 max-w-prose whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-relaxed text-foreground">
            {inventory.notes}
          </p>
        ) : null}
      </header>

      <ActionBar inventory={inventory} />

      <SignatureSection inventory={inventory} />

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground tabular-nums">
          {t('rooms', { count: String(inventory.rooms.length) })}
        </h2>
        {inventory.rooms.length === 0 ? (
          <EmptyState
            icon={<DoorOpen className="size-8" aria-hidden="true" />}
            title={t('empty_rooms_title')}
            description={t('empty_rooms_description')}
          />
        ) : (
          <div className="space-y-3">
            {inventory.rooms.map((room, index) => (
              <RoomCard
                key={`${room.name}-${index}`}
                room={room}
                inventoryId={inventory.id}
                canUpload={isDraft}
                photos={
                  inventory.room_photos?.find((g) => g.room_name === room.name)?.photos ?? []
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RoomCard({
  room,
  inventoryId,
  canUpload,
  photos: sent,
}: {
  readonly room: Inventory['rooms'][number];
  readonly inventoryId: number;
  readonly canUpload: boolean;
  readonly photos: readonly InventoryRoomPhoto[];
}) {
  const t = useTranslations('inventory.detail');
  const tConditions = useTranslations('inventory.conditions');
  const upload = useUploadInventoryRoomPhotos(inventoryId);
  const remove = useDeleteInventoryRoomPhoto(inventoryId);
  const [photos, setPhotos] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  return (
    <article className="rounded-xl bg-card p-4" data-testid={`room-card-${room.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-foreground">{room.name}</h3>
          <p className="text-xs text-muted-foreground">
            {t('roomCondition', { condition: tConditions(room.condition) })}
          </p>
        </div>
      </div>

      {room.notes ? (
        <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground">{room.notes}</p>
      ) : null}

      {room.elements && room.elements.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {room.elements.map((el, i) => (
            <li
              key={`${el.label}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{el.label}</span>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <InventoryElementStateBadge state={el.state} />
                {el.notes ? (
                  <span className="text-xs text-muted-foreground">{el.notes}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {sent.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label={t('roomPhotos', { room: room.name })}>
          {sent.map((photo, i) => (
            <li key={photo.id} className="relative overflow-hidden rounded-lg bg-muted outline outline-1 -outline-offset-1 outline-black/10">
              {/* URL d'API signée, servie par Laravel : ni `next/image` ni son optimiseur n'y ont accès. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={t('roomPhotoAlt', { index: i + 1, room: room.name })}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              {canUpload ? (
                <button
                  type="button"
                  onClick={async () => {
                    setDeletingId(photo.id);
                    try {
                      await remove.mutateAsync(photo.id);
                    } catch {
                      // Surfaced via `remove.isError` below.
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  disabled={deletingId !== null}
                  aria-label={t('deleteRoomPhotoAria', { index: i + 1, room: room.name })}
                  className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
                >
                  {deletingId === photo.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t('deleteRoomPhotoFailed')}
        </p>
      ) : null}

      {canUpload ? (
        <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border p-3">
          <MediaDropzone
            maxSize={INVENTORY_PHOTO_MAX_BYTES}
            onChange={(next) => setPhotos((prev) => [...prev, ...next])}
            files={photos}
            onRemove={(index) =>
              setPhotos((prev) => prev.filter((_, i) => i !== index))
            }
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={photos.length === 0 || upload.isPending}
              onClick={async () => {
                if (photos.length === 0) return;
                try {
                  await upload.mutateAsync({ files: photos, roomName: room.name });
                  setPhotos([]);
                } catch {
                  // Error surfaced via `upload.isError` below.
                }
              }}
            >
              {upload.isPending ? t('sending') : t('sendPhotos')}
            </Button>
            {upload.isError ? (
              <span role="alert" className="text-xs text-destructive">
                {t('uploadFailed')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ActionBar({ inventory }: { readonly inventory: Inventory }) {
  const t = useTranslations('inventory.detail');
  const tStatus = useTranslations('inventory.status');
  const submit = useSubmitInventory(inventory.id);
  const dispute = useDisputeInventory(inventory.id);
  const [reason, setReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);

  const canSubmit = inventory.status === 'draft';
  const canDispute = inventory.status === 'pending_signature' || inventory.status === 'signed';
  // PDF download is surfaced here (always visible when signed) so it sits
  // next to the other actions. Signing itself happens in <SignatureSection>.
  const showPdfAction = inventory.signed_at !== undefined && inventory.signed_at !== null;

  if (!canSubmit && !canDispute && !showPdfAction) {
    return (
      <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground sm:p-5">
        {t('terminalState', { status: tStatus(inventory.status) })}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {canSubmit ? (
          <Button
            type="button"
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
          >
            {submit.isPending ? t('submitting') : t('submitForSignature')}
          </Button>
        ) : null}
        {canDispute ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDispute((v) => !v)}
          >
            {showDispute ? t('cancelDispute') : t('dispute')}
          </Button>
        ) : null}
        {showPdfAction ? (
          <InventoryPdfButton
            inventoryId={inventory.id}
            signedAt={inventory.signed_at ?? null}
          />
        ) : null}
      </div>

      {showDispute ? (
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <label
            htmlFor="dispute-reason"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t('disputeReason')}
          </label>
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="bg-card"
            placeholder={t('disputeReasonPlaceholder')}
          />
          {dispute.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {t('disputeFailed')}
            </p>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={reason.trim().length === 0 || dispute.isPending}
            onClick={async () => {
              try {
                await dispute.mutateAsync({ reason });
                setReason('');
                setShowDispute(false);
              } catch {
                /* surfaced via `dispute.isError` above */
              }
            }}
          >
            {t('sendDispute')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders the two-party signature block. The canvas is only offered while
 * the inventory is actively signable (`draft` or `pending_signature`).
 *
 * TCK-596 — le canevas s'ouvre à qui l'API laisse signer, et à lui seul : `can_sign_as` est jugé
 * par le même prédicat que la signature (`InventorySignatureService::canSignAs`). Deviner à partir
 * des rôles ouvrait le canevas bailleur à tout `agent|agency_admin|owner|super_admin`, puis l'API
 * répondait 403 ; le super-admin voyait même les deux.
 */
function SignatureSection({ inventory }: { readonly inventory: Inventory }) {
  const signable =
    inventory.status === 'draft' || inventory.status === 'pending_signature';
  const roles = inventory.can_sign_as ?? [];

  return (
    <InventorySignatures
      inventory={inventory}
      canSignTenant={signable && roles.includes('tenant')}
      canSignLandlord={signable && roles.includes('landlord')}
      landlordOnBehalfOf={inventory.sign_on_behalf_of?.full_name ?? null}
    />
  );
}
