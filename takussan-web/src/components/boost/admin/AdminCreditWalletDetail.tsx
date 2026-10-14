'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { CreditLot, CreditMovement } from '../types';
import { adjustCreditWallet, fetchCreditWallet } from './api';

/** TCK-633 lot F (ADR-0061 §2, AC16) — un portefeuille : lots, journal, ajustement motivé. */
export function AdminCreditWalletDetail({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('superAdmin.credits.detail');
  const tListe = useTranslations('superAdmin.credits');
  const tCredits = useTranslations('credits');
  const f = useFormatteurs();
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [retour, setRetour] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);

  const wallet = useQuery({
    queryKey: ['super-admin', 'credit-wallets', agencyId, page],
    queryFn: () => fetchCreditWallet(agencyId, page),
  });
  const ajuster = useMutation({
    mutationFn: (body: { amount: number; reason: string }) => avecGardeDoubleFacteur(() => adjustCreditWallet(agencyId, body), garde),
    onSuccess: () => {
      setMontant('');
      setMotif('');
      setRetour({ ok: true, texte: t('adjustDone') });
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'credit-wallets'] });
    },
    onError: (err) => setRetour({ ok: false, texte: messageErreur(err, t('adjustFailed')) }),
  });

  const valeur = Number(montant);
  const valide = Number.isInteger(valeur) && valeur !== 0 && motif.trim().length >= 5;

  const colLots: DataTableColumn<CreditLot>[] = [
    { id: 'origin', header: t('colOrigin'), cell: (l) => tCredits(`origins.${l.origin}`) },
    { id: 'remaining', header: t('colRemaining'), align: 'end', cell: (l) => <span className="tabular-nums">{l.remaining_amount} / {l.initial_amount}</span> },
    { id: 'expires', header: t('colExpires'), cell: (l) => (l.expires_at ? f.date(l.expires_at) : t('noExpiry')) },
    { id: 'reason', header: t('colReason'), cell: (l) => l.reason ?? '—' },
  ];
  const colMouvements: DataTableColumn<CreditMovement>[] = [
    { id: 'date', header: t('colDate'), cell: (m) => f.dateTime(m.created_at) },
    { id: 'type', header: t('colType'), cell: (m) => tCredits(`types.${m.type}`) },
    { id: 'amount', header: t('colAmount'), align: 'end', cell: (m) => <span className="tabular-nums">{m.amount > 0 ? `+${m.amount}` : String(m.amount)}</span> },
    { id: 'reason', header: t('colReason'), cell: (m) => m.reason ?? '—' },
  ];
  const donnees = wallet.data;

  return (
    <DataState
      loading={wallet.isLoading}
      error={wallet.isError ? tListe('loadError') : null}
      onRetry={() => void wallet.refetch()}
      retryLabel={tListe('retry')}
    >
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">{donnees?.data.agency.name}</h2>
            <p className="text-sm tabular-nums text-muted-foreground">{t('balance', { count: donnees?.data.balance ?? 0 })}</p>
          </div>
          <Link href="/super-admin/credits" className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('back')}</Link>
        </div>

        <section aria-labelledby="ajustement" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 id="ajustement" className="font-medium text-foreground">{t('adjustTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('adjustHelp')}</p>
          <form
            className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (valide) ajuster.mutate({ amount: valeur, reason: motif.trim() });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="ajustement-montant">{t('amount')}</Label>
              <Input id="ajustement-montant" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ajustement-motif">{t('reason')}</Label>
              <Textarea id="ajustement-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
            <Button type="submit" disabled={!valide || ajuster.isPending}>{t('adjustSubmit')}</Button>
          </form>
          {retour ? (
            <p role={retour.ok ? 'status' : 'alert'} className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retour.texte}</p>
          ) : null}
        </section>

        <section aria-labelledby="lots" className="space-y-3">
          <h3 id="lots" className="font-medium text-foreground">{t('lotsTitle')}</h3>
          {donnees && donnees.data.lots.length > 0 ? (
            <DataTable caption={t('lotsCaption')} columns={colLots} rows={donnees.data.lots} rowKey={(l) => l.id} />
          ) : (
            <EmptyState title={t('lotsEmpty')} />
          )}
        </section>

        <section aria-labelledby="journal" className="space-y-3">
          <h3 id="journal" className="font-medium text-foreground">{t('movementsTitle')}</h3>
          {donnees && donnees.movements.length > 0 ? (
            <>
              <DataTable caption={t('movementsCaption')} columns={colMouvements} rows={donnees.movements} rowKey={(m) => m.id} />
              <Pagination page={donnees.meta.current_page} lastPage={donnees.meta.last_page} onChange={setPage} />
            </>
          ) : (
            <EmptyState title={t('movementsEmpty')} />
          )}
        </section>
      </div>
    </DataState>
  );
}
