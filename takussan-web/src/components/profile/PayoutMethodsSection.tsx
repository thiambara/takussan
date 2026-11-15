'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  useCreateMyPayoutMethod,
  useDeleteMyPayoutMethod,
  useMyPayoutMethods,
  useSendPayoutBankStatement,
  useSetDefaultPayoutMethod,
} from '@/lib/queries/payments';
import type { PayoutMethod, PayoutMethodKind } from '@/types/invoice';

/** TCK-2864 — le RIB : un PDF ou une image (bornes de l'API, `StorePayoutMethodBankStatementRequest`). */
const TYPES_DU_RIB = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

/**
 * TCK-2864 — l'état de vérification d'une destination ; une API d'avant ne dit que `verified`. « À
 * confirmer » et « En revue » ne valent que pour un compte bancaire, le seul que le titulaire puisse
 * faire avancer (son RIB) : un numéro mobile non vérifié reste « En attente de vérification » — c'est
 * l'agence qui le vérifie.
 */
function etatDeVerification(m: PayoutMethod): 'verified' | 'in_review' | 'to_confirm' | 'pending' {
  if (m.verified) return 'verified';
  if (m.kind !== 'bank_transfer') return 'pending';
  return m.verification_status ?? 'pending';
}

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
  const envoiRib = useSendPayoutBankStatement();
  const router = useRouter();
  const toast = useToast();
  // TCK-2864 — « Envoyer le RIB » ouvre le choix d'un fichier ; le compte visé attend dans `ribPour`.
  const choixDuRib = useRef<HTMLInputElement>(null);
  const ribPour = useRef<number | null>(null);

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

  const envoyerLeRib = async (file: File | undefined) => {
    const id = ribPour.current;
    ribPour.current = null;
    if (!file || id === null) return;
    const ok = await run(() => envoiRib.mutateAsync({ id, file }), t('ribEchec'));
    if (ok) {
      toast.add({ title: t('ribEnvoyeToast'), type: 'success' });
      // Les points et « N réglages demandent votre attention » se calculent au serveur (layout).
      router.refresh();
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

      <input
        ref={choixDuRib}
        type="file"
        accept={TYPES_DU_RIB}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-slot="choix-du-rib"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void envoyerLeRib(file);
        }}
      />

      {methods.length > 0 ? (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
          {methods.map((method) => {
            const Icone = method.kind === 'bank_transfer' ? Landmark : Smartphone;
            const etat = etatDeVerification(method);
            // TCK-2864 — un compte bancaire « À confirmer » attend son RIB (maquette `SectionVersement`).
            const ribAttendu = method.kind === 'bank_transfer' && etat === 'to_confirm';
            return (
              <li key={method.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce">
                  <Icone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-corps font-medium text-foreground">{tKind(method.kind)}</p>
                    {method.is_default ? <StatusBadge tone="success" label={t('default')} /> : null}
                    {etat === 'to_confirm' ? (
                      <StatusBadge tone="attention" label={t('aConfirmer')} />
                    ) : etat === 'in_review' ? (
                      <StatusBadge tone="info" label={t('enRevue')} />
                    ) : etat === 'pending' ? (
                      <StatusBadge tone="attention" label={t('pending')} />
                    ) : null}
                  </div>
                  <p className="text-ui leading-snug text-muted-foreground">
                    <span className="tabular-nums">{method.masked_identifier ?? '—'}</span>
                    {method.verified ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{t('verified')}</span>
                      </>
                    ) : ribAttendu || (method.kind === 'bank_transfer' && etat === 'in_review') ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{ribAttendu ? t('ribAttendu') : t('ribEnvoye')}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ribAttendu ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={envoiRib.isPending}
                      aria-label={t('envoyerRibAria', { masked: method.masked_identifier ?? '' })}
                      onClick={() => {
                        ribPour.current = method.id;
                        choixDuRib.current?.click();
                      }}
                    >
                      {t('envoyerRib')}
                    </Button>
                  ) : null}
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
