'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useSignInventory,
  type InventorySignInput,
} from '@/lib/queries/inventory';
import type { Inventory, InventorySignatureRole } from '@/types/inventory';

import { SignaturePad } from './SignaturePad';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

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
  const t = useTranslations('inventory.signatures');
  return (
    <section
      aria-labelledby="inventory-signatures-heading"
      className="rounded-2xl bg-card p-5"
    >
      <header className="mb-4">
        <h3
          id="inventory-signatures-heading"
          className="text-sm font-semibold text-foreground"
        >
          {t('title')}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.rich('immutableNotice', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <SignatureCard
          inventory={inventory}
          role="tenant"
          canSign={canSignTenant}
          signed={inventory.tenant_signed}
          signedAt={inventory.tenant_signed_at}
          hash={inventory.tenant_signature_hash ?? null}
        />
        <SignatureCard
          inventory={inventory}
          role="landlord"
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
  readonly canSign: boolean;
  readonly signed: boolean;
  readonly signedAt: string | null;
  readonly hash: string | null;
}

function SignatureCard({
  inventory,
  role,
  canSign,
  signed,
  signedAt,
  hash,
}: SignatureCardProps) {
  const t = useTranslations('inventory.signatures');
  const messageErreur = useMessageErreurApi();
  const title = t(`roles.${role}`);
  const roleLower = t(`rolesLower.${role}`);
  const locale = useLocale() as Locale;
  const sign = useSignInventory(inventory.id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (signed) {
    return (
      <article
        data-testid={`signature-card-${role}`}
        className="rounded-xl border border-success/30 bg-success/10 p-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-success">{title}</h4>
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">
            {t('signed')}
          </span>
        </div>
        <p className="mt-2 text-xs text-success">
          {signedAt
            ? t('signedOn', { date: formatDateTime(signedAt, locale) })
            : t('signed')}
        </p>
        {hash ? (
          <p className="mt-2 font-mono text-[10px] break-all text-success/80">
            {t('fingerprint')}
            {'\u00a0: '}
            {hash.slice(0, 32)}
            {'…'}
          </p>
        ) : null}
      </article>
    );
  }

  if (!canSign) {
    return (
      <article
        data-testid={`signature-card-${role}`}
        className="rounded-xl border border-border bg-muted/50 p-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('notSigned')}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('awaiting', { role: roleLower })}
        </p>
      </article>
    );
  }

  return (
    <article
      data-testid={`signature-card-${role}`}
      className="rounded-xl border border-warning/30 bg-warning/10 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-warning">{title}</h4>
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
          {t('toSign')}
        </span>
      </div>
      <SignaturePad
        label={t('signAs', { role: roleLower })}
        helperText={t('helper')}
        confirmLabel={t('confirmAs', { role: roleLower })}
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
              setErrorMessage(messageErreur(err));
            } else {
              // `err.message` d'une `Error` JS est un texte technique anglais, jamais un libellé.
              setErrorMessage(t('signFailed'));
            }
          }
        }}
      />
    </article>
  );
}
