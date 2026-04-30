'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';

import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useSignInventory,
  type InventorySignInput,
} from '@/lib/queries/inventory';
import type { Inventory, InventorySignatureRole } from '@/types/inventory';

import { SignaturePad } from './SignaturePad';

/**
 * TCK-076 — two side-by-side signature cards (tenant + landlord). Each
 * card shows either the already-signed state (hash + date + read-only
 * preview) or a canvas pad if the current viewer can sign the role.
 *
 * The component is unopinionated about *who* the viewer is — callers pass
 * `canSignTenant` / `canSignLandlord` based on their own permission
 * checks. The backend re-validates, so the UI is just UX sugar.
 */

export interface InventorySignaturesProps {
  readonly inventory: Inventory;
  /** True when the current user matches the tenant linked to the lease. */
  readonly canSignTenant?: boolean;
  /** True when the current user is the landlord / agency / collaborator. */
  readonly canSignLandlord?: boolean;
}

type CardRole = InventorySignatureRole;

export function InventorySignatures({
  inventory,
  canSignTenant = false,
  canSignLandlord = false,
}: InventorySignaturesProps) {
  return (
    <section
      aria-labelledby="inventory-signatures-heading"
      className="rounded-2xl bg-app-surface-1 p-5"
    >
      <header className="mb-4">
        <h3
          id="inventory-signatures-heading"
          className="text-sm font-semibold text-app-ink"
        >
          Signatures des parties
        </h3>
        <p className="mt-1 text-xs text-app-ink-muted">
          Une signature est <strong>immuable</strong> une fois posée. L&apos;inventaire
          est figé dès que les deux parties ont signé.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <SignatureCard
          inventory={inventory}
          role="tenant"
          title="Locataire"
          canSign={canSignTenant}
          signed={inventory.tenant_signed}
          signedAt={inventory.tenant_signed_at}
          hash={inventory.tenant_signature_hash ?? null}
        />
        <SignatureCard
          inventory={inventory}
          role="landlord"
          title="Bailleur"
          canSign={canSignLandlord}
          signed={inventory.owner_signed}
          signedAt={inventory.owner_signed_at}
          hash={inventory.owner_signature_hash ?? null}
        />
      </div>
    </section>
  );
}

interface SignatureCardProps {
  readonly inventory: Inventory;
  readonly role: CardRole;
  readonly title: string;
  readonly canSign: boolean;
  readonly signed: boolean;
  readonly signedAt: string | null;
  readonly hash: string | null;
}

function SignatureCard({
  inventory,
  role,
  title,
  canSign,
  signed,
  signedAt,
  hash,
}: SignatureCardProps) {
  const locale = useLocale() as Locale;
  const sign = useSignInventory(inventory.id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (signed) {
    return (
      <article
        data-testid={`signature-card-${role}`}
        className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-emerald-900">{title}</h4>
          <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
            Signé
          </span>
        </div>
        <p className="mt-2 text-xs text-emerald-900">
          {signedAt ? `Signé le ${formatDateTime(signedAt, locale)}` : 'Signé'}
        </p>
        {hash ? (
          <p className="mt-2 font-mono text-[10px] break-all text-emerald-900/80">
            Empreinte&nbsp;: {hash.slice(0, 32)}…
          </p>
        ) : null}
      </article>
    );
  }

  if (!canSign) {
    return (
      <article
        data-testid={`signature-card-${role}`}
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Non signé
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          En attente de la signature de {title.toLowerCase()}.
        </p>
      </article>
    );
  }

  return (
    <article
      data-testid={`signature-card-${role}`}
      className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-amber-900">{title}</h4>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
          À signer
        </span>
      </div>
      <SignaturePad
        label={`Signer comme ${title.toLowerCase()}`}
        helperText="Tracez votre signature puis confirmez — l'action est définitive."
        confirmLabel={`Signer en tant que ${title.toLowerCase()}`}
        pending={sign.isPending}
        errorMessage={errorMessage}
        onConfirm={async (dataUrl) => {
          setErrorMessage(null);
          try {
            const payload: InventorySignInput = {
              role,
              signature: dataUrl,
            };
            await sign.mutateAsync(payload);
          } catch (err) {
            if (err instanceof ApiError) {
              setErrorMessage(err.displayMessage);
            } else if (err instanceof Error) {
              setErrorMessage(err.message);
            } else {
              setErrorMessage('Signature impossible. Réessayez.');
            }
          }
        }}
      />
    </article>
  );
}
