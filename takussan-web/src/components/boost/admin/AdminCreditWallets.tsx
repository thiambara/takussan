'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchCreditWallets, type CreditWallet } from './api';

/** TCK-633 lot F (ADR-0061 §1) — les espaces qui ont des crédits, et leur solde. */
export function AdminCreditWallets() {
  const t = useTranslations('superAdmin.credits');
  const f = useFormatteurs();
  const [saisie, setSaisie] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const wallets = useQuery({
    queryKey: ['super-admin', 'credit-wallets', search, page],
    queryFn: () => fetchCreditWallets({ search, page }),
  });

  const colonnes: DataTableColumn<CreditWallet>[] = [
    { id: 'agency', header: t('colAgency'), className: 'font-medium text-foreground', cell: (w) => w.name },
    { id: 'balance', header: t('colBalance'), align: 'end', cell: (w) => <span className="tabular-nums">{w.balance}</span> },
    { id: 'expiry', header: t('colNextExpiry'), cell: (w) => (w.next_expiry_at ? f.date(w.next_expiry_at) : '—') },
    {
      id: 'open',
      header: t('open'),
      headerSrOnly: true,
      align: 'end',
      cell: (w) => (
        <Link href={`/super-admin/credits/${w.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {t('open')}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(saisie.trim());
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="credit-wallets-search">{t('search')}</Label>
          <Input id="credit-wallets-search" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">{t('searchSubmit')}</Button>
      </form>
      <DataState
        loading={wallets.isLoading}
        error={wallets.isError ? t('loadError') : null}
        onRetry={() => void wallets.refetch()}
        retryLabel={t('retry')}
        isEmpty={(wallets.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        <DataTable caption={t('caption')} columns={colonnes} rows={wallets.data?.data ?? []} rowKey={(w) => w.id} />
        <Pagination page={wallets.data?.meta.current_page ?? 1} lastPage={wallets.data?.meta.last_page ?? 1} onChange={setPage} />
      </DataState>
    </div>
  );
}
