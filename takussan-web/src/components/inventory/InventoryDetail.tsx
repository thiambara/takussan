'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';

import { MediaDropzone } from '@/components/media';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useDisputeInventory,
  useInventory,
  useSubmitInventory,
  useUploadInventoryRoomPhotos,
} from '@/lib/queries/inventory';
import type { Inventory } from '@/types/inventory';

import {
  INVENTORY_CONDITION_LABEL,
  INVENTORY_STATUS_LABEL,
} from './labels';
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
  const locale = useLocale() as Locale;
  const isDraft = inventory.status === 'draft';

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-app-surface-1 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-app-ink">
              {inventory.property?.title ?? `État des lieux #${inventory.id}`}
            </p>
            <p className="mt-1 text-xs text-app-ink-muted">
              {inventory.property?.slug ? (
                <Link
                  href={`/properties/${inventory.property.slug}`}
                  className="hover:underline"
                >
                  Voir le bien
                </Link>
              ) : (
                <>Bien #{inventory.property_id}</>
              )}
              {' · '}
              <Link
                href={`/app/leases/${inventory.lease_id}`}
                className="hover:underline"
              >
                {inventory.lease?.reference_number ?? `Bail #${inventory.lease_id}`}
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <InventoryTypeBadge type={inventory.type} />
            <InventoryStatusBadge status={inventory.status} />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-xs text-app-ink-muted md:grid-cols-4">
          <div>
            <dt className="font-semibold uppercase tracking-wide">État général</dt>
            <dd className="mt-0.5 text-app-ink">
              {INVENTORY_CONDITION_LABEL[inventory.general_condition]}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">Réalisé le</dt>
            <dd className="mt-0.5 text-app-ink">
              {inventory.conducted_at ? formatDateTime(inventory.conducted_at, locale) : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">Locataire</dt>
            <dd className="mt-0.5 text-app-ink">
              {inventory.tenant_signed && inventory.tenant_signed_at
                ? `Signé le ${formatDateTime(inventory.tenant_signed_at, locale)}`
                : 'En attente'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">Bailleur</dt>
            <dd className="mt-0.5 text-app-ink">
              {inventory.owner_signed && inventory.owner_signed_at
                ? `Signé le ${formatDateTime(inventory.owner_signed_at, locale)}`
                : 'En attente'}
            </dd>
          </div>
        </dl>

        {inventory.notes ? (
          <p className="mt-4 whitespace-pre-wrap rounded-md bg-app-surface-2 p-3 text-sm text-app-ink">
            {inventory.notes}
          </p>
        ) : null}
      </header>

      <ActionBar inventory={inventory} />

      <SignatureSection inventory={inventory} />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-app-ink">
          Pièces ({inventory.rooms.length})
        </h3>
        {inventory.rooms.length === 0 ? (
          <p className="rounded-xl bg-app-surface-1 p-6 text-center text-sm text-app-ink-muted">
            Aucune pièce n&apos;a été enregistrée dans ce brouillon.
          </p>
        ) : (
          <div className="space-y-3">
            {inventory.rooms.map((room, index) => (
              <RoomCard
                key={`${room.name}-${index}`}
                room={room}
                inventoryId={inventory.id}
                canUpload={isDraft}
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
}: {
  readonly room: Inventory['rooms'][number];
  readonly inventoryId: number;
  readonly canUpload: boolean;
}) {
  const upload = useUploadInventoryRoomPhotos(inventoryId);
  const [photos, setPhotos] = useState<File[]>([]);

  return (
    <article className="rounded-xl bg-app-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-app-ink">{room.name}</p>
          <p className="text-xs text-app-ink-muted">
            État : {INVENTORY_CONDITION_LABEL[room.condition]}
          </p>
        </div>
      </div>

      {room.notes ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-app-ink">{room.notes}</p>
      ) : null}

      {room.elements && room.elements.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {room.elements.map((el, i) => (
            <li
              key={`${el.label}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-app-surface-2 px-3 py-2 text-sm"
            >
              <span className="font-medium text-app-ink">{el.label}</span>
              <div className="flex items-center gap-2">
                <InventoryElementStateBadge state={el.state} />
                {el.notes ? (
                  <span className="text-xs text-app-ink-muted">{el.notes}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {canUpload ? (
        <div className="mt-3 space-y-3 rounded-md border border-dashed border-app-surface-3 p-3">
          <MediaDropzone
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
              {upload.isPending ? 'Envoi…' : 'Envoyer les photos'}
            </Button>
            {upload.isError ? (
              <span className="text-xs text-destructive">
                L&apos;envoi a échoué. Réessayez.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ActionBar({ inventory }: { readonly inventory: Inventory }) {
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
      <div className="rounded-2xl bg-app-surface-1 p-5 text-sm text-app-ink-muted">
        Cet état des lieux est dans un état terminal (
        {INVENTORY_STATUS_LABEL[inventory.status]}).
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-app-surface-1 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {canSubmit ? (
          <Button
            type="button"
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
          >
            {submit.isPending ? 'Envoi…' : 'Soumettre pour signature'}
          </Button>
        ) : null}
        {canDispute ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDispute((v) => !v)}
          >
            {showDispute ? 'Annuler le litige' : 'Contester'}
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
        <div className="space-y-2 rounded-md bg-app-surface-2 p-3">
          <label
            htmlFor="dispute-reason"
            className="block text-xs font-semibold uppercase tracking-wide text-app-ink-muted"
          >
            Motif du litige
          </label>
          <textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            placeholder="Expliquez le point contesté"
          />
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
                /* error surfaced via react-query state if needed */
              }
            }}
          >
            Envoyer le litige
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
 * The `canSignTenant` / `canSignLandlord` flags here are UX-only hints to
 * hide the canvas for users who obviously can't sign a given role (e.g. a
 * `customer` user shouldn't see a landlord canvas). The backend enforces
 * the real rule via `InventorySignatureService::authorizeRole()`.
 */
function SignatureSection({ inventory }: { readonly inventory: Inventory }) {
  const { user } = useAuth();

  const signable =
    inventory.status === 'draft' || inventory.status === 'pending_signature';

  const roles = user?.roles ?? [];
  const isCustomer = roles.includes('customer');
  const isPrivileged = roles.some((r) =>
    ['agent', 'agency_admin', 'owner', 'super_admin'].includes(r),
  );

  // Admins see both canvases; customer-only users only the tenant one;
  // privileged users only the landlord one. Absent a logged-in user we
  // simply don't expose any canvas — the backend would 401 anyway.
  const canSignTenant = signable && (isCustomer || roles.includes('super_admin'));
  const canSignLandlord = signable && (isPrivileged || roles.includes('super_admin'));

  return (
    <InventorySignatures
      inventory={inventory}
      canSignTenant={canSignTenant}
      canSignLandlord={canSignLandlord}
    />
  );
}
