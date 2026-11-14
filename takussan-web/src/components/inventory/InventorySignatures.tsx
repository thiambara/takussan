'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
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
  /** True when the API lets the current user sign as landlord (`can_sign_as`). */
  readonly canSignLandlord?: boolean;
  /**
   * TCK-596 — le bailleur pour le compte duquel l'utilisateur courant signe (personnel de l'agence
   * au titre du mandat), ou `null` quand il est le bailleur.
   */
  readonly landlordOnBehalfOf?: string | null;
  /**
   * TCK-2648 (AC4) — les signataires NOMMÉS, une seule fois, sur leur carte : « Locataire · Aminata
   * Diop ». Absents (une réponse qui ne les sert pas), la carte dit le seul rôle, comme avant.
   */
  readonly nomDuLocataire?: string | null;
  readonly nomDuBailleur?: string | null;
}

type CardRole = InventorySignatureRole;

export function InventorySignatures({
  inventory,
  canSignTenant = false,
  canSignLandlord = false,
  landlordOnBehalfOf = null,
  nomDuLocataire = null,
  nomDuBailleur = null,
}: InventorySignaturesProps) {
  const t = useTranslations('inventory.signatures');
  return (
    <section
      aria-labelledby="inventory-signatures-heading"
      className="rounded-xl bg-card p-4 sm:p-5"
    >
      <header className="mb-4">
        <h2
          id="inventory-signatures-heading"
          className="font-display text-base font-semibold text-foreground"
        >
          {t('title')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.rich('immutableNotice', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <SignatureCard
          inventory={inventory}
          role="tenant"
          canSign={canSignTenant}
          signed={inventory.tenant_signed}
          signedAt={inventory.tenant_signed_at}
          hash={inventory.tenant_signature_hash ?? null}
          nom={nomDuLocataire}
          detail={detailDuLocataire(inventory, t)}
        />
        <SignatureCard
          inventory={inventory}
          role="landlord"
          canSign={canSignLandlord}
          signed={inventory.owner_signed}
          signedAt={inventory.owner_signed_at}
          hash={inventory.owner_signature_hash ?? null}
          onBehalfOf={landlordOnBehalfOf}
          signedOnBehalf={inventory.owner_signed_on_behalf_of_user_id != null}
          nom={inventory.owner_signed_on_behalf_of?.full_name ?? nomDuBailleur}
          detail={detailDuBailleur(inventory, t)}
        />
      </div>
    </section>
  );
}

type Traducteur = ReturnType<typeof useTranslations<'inventory.signatures'>>;

/** TCK-2648 — la voie de la signature du locataire : sur place (qui l'a recueillie, à quel numéro), ou rien. */
function detailDuLocataire(inventory: Inventory, t: Traducteur): string | null {
  if (inventory.tenant_signature_method !== 'onsite_otp') return null;
  const agent = inventory.tenant_signed_via?.full_name;
  const numero = inventory.tenant_otp_destination;
  if (agent && numero) return t('surPlaceParEtNumero', { agent, numero });
  if (numero) return t('surPlaceNumero', { numero });
  return t('surPlace');
}

/** TCK-2648 — qui a signé pour le bailleur (« par Sokhna Sène, au titre du mandat »), nommé. */
function detailDuBailleur(inventory: Inventory, t: Traducteur): string | null {
  const par = inventory.owner_signed_by?.full_name;
  if (!par || inventory.owner_signed_on_behalf_of_user_id == null) return null;
  return t('parAuTitreDuMandat', { nom: par });
}

interface SignatureCardProps {
  readonly inventory: Inventory;
  readonly role: CardRole;
  readonly canSign: boolean;
  readonly signed: boolean;
  readonly signedAt: string | null;
  readonly hash: string | null;
  readonly onBehalfOf?: string | null;
  readonly signedOnBehalf?: boolean;
  readonly nom?: string | null;
  readonly detail?: string | null;
}

function SignatureCard({
  inventory,
  role,
  canSign,
  signed,
  signedAt,
  hash,
  onBehalfOf = null,
  signedOnBehalf = false,
  nom = null,
  detail = null,
}: SignatureCardProps) {
  const t = useTranslations('inventory.signatures');
  const messageErreur = useMessageErreurApi();
  const title = nom ? t('roleEtNom', { role: t(`roles.${role}`), nom }) : t(`roles.${role}`);
  const roleLower = t(`rolesLower.${role}`);
  const f = useFormatteurs();
  const sign = useSignInventory(inventory.id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (signed) {
    return (
      <article
        data-testid={`signature-card-${role}`}
        className="rounded-xl border border-success/30 bg-success/10 p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-success">{title}</h3>
          <span className="shrink-0 rounded-full border border-success/30 bg-card px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-success">
            {t('signed')}
          </span>
        </div>
        <p className="mt-2 text-xs text-success">
          {/* TCK-2648 (AC4) — « Signé le 1 juil. 2026 » : la date, sans heure (jamais « 00:00 »). */}
          {signedAt
            ? t('signedOn', { date: f.date(signedAt) })
            : t('signed')}
        </p>
        {detail ? (
          <p className="mt-1 text-xs text-success">{detail}</p>
        ) : signedOnBehalf ? (
          <p className="mt-1 text-xs text-success">{t('signedOnBehalf')}</p>
        ) : null}
        {hash ? (
          <p className="mt-2 font-mono text-xs break-all text-success">
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
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
          <span className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-warning">{title}</h3>
        <span className="shrink-0 rounded-full border border-warning/30 bg-card px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-warning">
          {t('toSign')}
        </span>
      </div>
      {onBehalfOf ? (
        <p className="mb-3 text-xs text-warning" data-testid="signature-on-behalf-of">
          {t('onBehalfOf', { name: onBehalfOf })}
        </p>
      ) : null}
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
