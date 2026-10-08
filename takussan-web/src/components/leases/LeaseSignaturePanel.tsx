'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatDate } from '@/lib/format';
import {
  useActivateLease,
  useRequestLeaseSignature,
  useSendLeaseSignatureCode,
  useSignLease,
  type LeaseSignatureCodeSent,
} from '@/lib/queries/leases';
import type { Locale } from '@/i18n/config';
import type { Lease, LeaseSignature, LeaseSignatureRole } from '@/types/lease';

const ROLES: readonly LeaseSignatureRole[] = ['tenant', 'landlord'];

interface LeaseSignaturePanelProps {
  readonly lease: Lease;
}

/**
 * TCK-596 §4B (ADR-0042) — la signature d'un bail, sur le détail.
 *
 * Le gestionnaire fige le contrat (« Demander la signature ») ; chaque partie lit CE contrat, reçoit
 * un code et le saisit ; la seconde signature active le bail. La voie papier (contrat numérisé)
 * reste au gestionnaire. Qui signe quoi, l'API en juge (`can_sign_as`, `can_request_signature`) :
 * l'écran n'ouvre que ce qu'elle laisse faire, et affiche ses refus tels qu'elle les dit.
 */
export function LeaseSignaturePanel({ lease }: LeaseSignaturePanelProps) {
  const t = useTranslations('lease.signature');
  const locale = useLocale() as Locale;
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const [error, setError] = useState<string | null>(null);

  const requestSignature = useRequestLeaseSignature(lease.id);
  const activateOnPaper = useActivateLease(lease.id);

  if (lease.status !== 'draft' && lease.status !== 'pending_signature') return null;

  const frozen = lease.status === 'pending_signature' && Boolean(lease.contract_sha256);
  const current = (lease.signatures ?? []).filter((s) => s.current);
  const signatureOf = (role: LeaseSignatureRole): LeaseSignature | undefined =>
    current.find((s) => s.role === role);
  const canManage = lease.can_request_signature === true;
  const canPaper = lease.can_activate_on_paper === true;
  const canSignAs = lease.can_sign_as ?? [];
  const onError = (e: unknown) => setError(messageErreur(e, t('genericError')));

  async function handleRequest() {
    setError(null);
    try {
      await requestSignature.mutateAsync();
      toast.add({ title: t('requestedToast'), type: 'success' });
    } catch (e) {
      onError(e);
    }
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      aria-labelledby="lease-signature-title"
      data-testid="lease-signature-panel"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="lease-signature-title" className="font-display text-base font-semibold text-foreground">
            {t('title')}
          </h2>
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            {frozen ? t('frozenDescription') : t('notFrozenDescription')}
          </p>
        </div>
        {frozen && (
          // TCK-593 — un document protégé ne s'ouvre pas par un lien nu : le jeton n'y voyage pas.
          <BoutonTelechargement
            chemin={`/api/leases/${lease.id}/contract/pdf`}
            nomFichier={`bail-${lease.reference_number ?? lease.id}-a-signer.pdf`}
          >
            {t('readContract')}
          </BoutonTelechargement>
        )}
      </header>

      {frozen && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {ROLES.map((role) => {
            const signature = signatureOf(role);
            return (
              <li key={role} className="rounded-lg border border-border p-4" data-testid={`lease-signature-${role}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{t(`roles.${role}`)}</span>
                  <Badge variant={signature ? 'default' : 'secondary'}>
                    {signature ? t('signed') : t('awaiting')}
                  </Badge>
                </div>
                {signature && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {signature.on_behalf_of_name
                      ? t('signedOnBehalf', {
                          signer: signature.signer_name ?? '—',
                          landlord: signature.on_behalf_of_name,
                          date: signature.signed_at ? formatDate(signature.signed_at, locale) : '—',
                        })
                      : t('signedBy', {
                          signer: signature.signer_name ?? '—',
                          date: signature.signed_at ? formatDate(signature.signed_at, locale) : '—',
                        })}
                  </p>
                )}
                {!signature && canSignAs.includes(role) && (
                  <SignWithCode leaseId={lease.id} role={role} onError={onError} clearError={() => setError(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {(canManage || canPaper) && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          {canManage && (
            <Button type="button" onClick={handleRequest} disabled={requestSignature.isPending}>
              {frozen ? t('requestAgain') : t('request')}
            </Button>
          )}
          {canPaper && (
            <PaperActivation
              pending={activateOnPaper.isPending}
              onSubmit={async (file) => {
                setError(null);
                try {
                  await activateOnPaper.mutateAsync({ contract: file });
                  toast.add({ title: t('activatedToast'), type: 'success' });
                } catch (e) {
                  onError(e);
                }
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

interface SignWithCodeProps {
  readonly leaseId: number;
  readonly role: LeaseSignatureRole;
  readonly onError: (e: unknown) => void;
  readonly clearError: () => void;
}

/** Recevoir son code, puis le saisir. Six chiffres, rien d'autre. */
function SignWithCode({ leaseId, role, onError, clearError }: SignWithCodeProps) {
  const t = useTranslations('lease.signature');
  const toast = useToast();
  const sendCode = useSendLeaseSignatureCode(leaseId);
  const sign = useSignLease(leaseId);
  const [sent, setSent] = useState<LeaseSignatureCodeSent | null>(null);
  const [code, setCode] = useState('');
  const inputId = `lease-signature-code-${role}`;
  const valid = /^\d{6}$/.test(code);

  async function handleSend() {
    clearError();
    try {
      const res = await sendCode.mutateAsync({ role });
      setSent(res.data);
    } catch (e) {
      onError(e);
    }
  }

  async function handleSign(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    clearError();
    try {
      const res = await sign.mutateAsync({ role, code });
      setCode('');
      toast.add({
        title: res.data.status === 'active' ? t('activatedToast') : t('signedToast'),
        type: 'success',
      });
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={handleSend} disabled={sendCode.isPending}>
        {sent ? t('resendCode') : t('sendCode')}
      </Button>
      {sent && (
        <form onSubmit={handleSign} className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t(sent.channel === 'sms' ? 'codeSentSms' : 'codeSentMail', { destination: sent.destination })}
          </p>
          <Label htmlFor={inputId}>{t('codeLabel')}</Label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-32 tabular-nums tracking-widest"
            />
            <Button type="submit" size="sm" disabled={!valid || sign.isPending}>
              {t('sign')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('consent')}</p>
        </form>
      )}
    </div>
  );
}

interface PaperActivationProps {
  readonly pending: boolean;
  readonly onSubmit: (file: File) => Promise<void>;
}

/** La voie hors plateforme : le contrat signé sur papier, numérisé, fait foi (ADR-0042 §6). */
function PaperActivation({ pending, onSubmit }: PaperActivationProps) {
  const t = useTranslations('lease.signature');
  const [file, setFile] = useState<File | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (file) void onSubmit(file);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="lease-paper-contract">{t('paperLabel')}</Label>
        <Input
          id="lease-paper-contract"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" variant="outline" disabled={!file || pending}>
        {t('paperSubmit')}
      </Button>
    </form>
  );
}
