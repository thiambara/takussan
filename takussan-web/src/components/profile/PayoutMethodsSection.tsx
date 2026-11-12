'use client';

import { useId, useState } from 'react';
import { Landmark, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const idFormulaire = useId();

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
      setAjoutOuvert(false);
    }
  };

  const optionsKind = KINDS.map((value) => ({ value, label: tKind(value) }));
  // TCK-2635 — le formulaire se déplie sous « Ajouter un moyen de versement » (maquette `a-6`) ;
  // sans aucune destination, il est ouvert d'emblée : c'est le seul geste de la section.
  const formulaireVisible = ajoutOuvert || (!isLoading && methods.length === 0);

  return (
    <section aria-labelledby="payout-methods-title" className="space-y-4">
      <h2 id="payout-methods-title" className="sr-only">
        {t('title')}
      </h2>

      {isLoading ? <Skeleton className="h-16 rounded-xl" /> : null}

      {!isLoading && methods.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}

      {methods.length > 0 ? (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
          {methods.map((method) => {
            const Icone = method.kind === 'bank_transfer' ? Landmark : Smartphone;
            return (
              <li key={method.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-foreground/75">
                  <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-corps font-medium text-foreground">{tKind(method.kind)}</p>
                    {method.is_default ? <StatusBadge tone="success" label={t('default')} /> : null}
                    {method.verified ? null : <StatusBadge tone="attention" label={t('pending')} />}
                  </div>
                  <p className="text-ui leading-snug text-muted-foreground">
                    <span className="tabular-nums">{method.masked_identifier ?? '—'}</span>
                    {method.verified ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{t('verified')}</span>
                      </>
                    ) : null}
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
            );
          })}
        </ul>
      ) : null}

      <p className="text-ui text-muted-foreground">{t('subtitle')}</p>

      {formulaireVisible ? null : (
        <Button type="button" variant="outline" size="sm" aria-expanded={false} aria-controls={idFormulaire} onClick={() => setAjoutOuvert(true)}>
          {t('ajouter')}
        </Button>
      )}

      {formulaireVisible ? (
        <div id={idFormulaire} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="payout-method-kind">{t('kind')}</Label>
            <Select
              value={kind}
              onValueChange={(next) => {
                if (next !== null) setKind(next as PayoutMethodKind);
              }}
              items={optionsKind}
            >
              <SelectTrigger id="payout-method-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsKind.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button type="button" className="sm:justify-self-start" disabled={identifier.trim() === '' || create.isPending} onClick={() => void add()}>
            {t('add')}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
