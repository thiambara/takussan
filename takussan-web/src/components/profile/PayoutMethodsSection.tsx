'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  useCreateMyPayoutMethod,
  useDeleteMyPayoutMethod,
  useMyPayoutMethods,
  useSetDefaultPayoutMethod,
} from '@/lib/queries/payments';
import type { PayoutMethodKind } from '@/types/invoice';

const KINDS: readonly PayoutMethodKind[] = ['wave', 'orange_money', 'free_money', 'bank_transfer'];

const SELECT_CLASS =
  'h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * TCK-594 (ADR-0039 §6) — où le bailleur ou le prestataire veut être payé.
 *
 * Le numéro n'est jamais réaffiché en clair une fois enregistré : la liste ne lit que la forme
 * masquée. Une destination est « en attente » tant que l'agence qui paie ne l'a pas vérifiée, et
 * toute modification du numéro la remet en attente (côté serveur) — avec un avis au titulaire.
 */
export function PayoutMethodsSection() {
  const t = useTranslations('profile.payoutMethods');
  const tKind = useTranslations('payments.payoutMethodKinds');
  const messageErreur = useMessageErreurApi();
  const { data, isLoading } = useMyPayoutMethods();
  const create = useCreateMyPayoutMethod();
  const setDefault = useSetDefaultPayoutMethod();
  const remove = useDeleteMyPayoutMethod();

  const [kind, setKind] = useState<PayoutMethodKind>('wave');
  const [identifier, setIdentifier] = useState('');
  const [holder, setHolder] = useState('');
  const [error, setError] = useState<string | null>(null);

  const methods = data?.data ?? [];

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(messageErreur(e, fallback));
      return false;
    }
  };

  const add = async () => {
    const ok = await run(
      () =>
        create.mutateAsync({
          kind,
          account_identifier: identifier.trim(),
          account_holder_name: holder.trim() || null,
          is_default: methods.length === 0,
        }),
      t('saveFailed'),
    );
    if (ok) {
      setIdentifier('');
      setHolder('');
    }
  };

  return (
    <section aria-labelledby="payout-methods-title" className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 id="payout-methods-title" className="text-lg font-bold text-foreground">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading ? <Skeleton className="h-16 rounded-lg" /> : null}

      {!isLoading && methods.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}

      {methods.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {methods.map((method) => (
            <li key={method.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {tKind(method.kind)} · <span className="tabular-nums">{method.masked_identifier ?? '—'}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {method.verified ? t('verified') : t('pending')}
                  {method.is_default ? ` · ${t('default')}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {method.is_default ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={setDefault.isPending}
                    onClick={() => void run(() => setDefault.mutateAsync({ id: method.id }), t('saveFailed'))}
                  >
                    {t('makeDefault')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  aria-label={t('removeAria', { masked: method.masked_identifier ?? '' })}
                  onClick={() => void run(() => remove.mutateAsync({ id: method.id }), t('removeFailed'))}
                >
                  {t('remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[180px_1fr_1fr_auto] lg:items-end">
        <div className="space-y-1">
          <Label htmlFor="payout-method-kind">{t('kind')}</Label>
          <select
            id="payout-method-kind"
            className={SELECT_CLASS}
            value={kind}
            onChange={(e) => setKind(e.target.value as PayoutMethodKind)}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {tKind(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="payout-method-identifier">
            {kind === 'bank_transfer' ? t('iban') : t('phone')}
          </Label>
          <Input
            id="payout-method-identifier"
            autoComplete="off"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="payout-method-holder">{t('holder')}</Label>
          <Input id="payout-method-holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
        </div>
        <Button type="button" disabled={identifier.trim() === '' || create.isPending} onClick={() => void add()}>
          {t('add')}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
