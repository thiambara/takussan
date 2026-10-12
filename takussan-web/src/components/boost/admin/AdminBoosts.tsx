'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { BoostStatus, PropertyBoost } from '../types';
import { cancelBoost, fetchAdminBoosts, fetchBoostProducts, offerBoost } from './api';

const STATUTS: readonly (BoostStatus | '')[] = ['', 'active', 'paused', 'ended', 'cancelled', 'refunded'];
const VIVANTS: ReadonlySet<BoostStatus> = new Set(['active', 'paused']);

/** TCK-633 lot F (ADR-0061 §5, AC16) — les boosts du parc ; annuler (avec ou sans remboursement), offrir. */
export function AdminBoosts() {
  const t = useTranslations('superAdmin.boosts');
  const f = useFormatteurs();
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [statut, setStatut] = useState<BoostStatus | ''>('');
  const [page, setPage] = useState(1);
  const [cible, setCible] = useState<PropertyBoost | null>(null);
  const [rembourser, setRembourser] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [offre, setOffre] = useState({ bien: '', produit: 0, motif: '' });
  const [retourOffre, setRetourOffre] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);

  const boosts = useQuery({ queryKey: ['super-admin', 'boosts', statut, page], queryFn: () => fetchAdminBoosts({ status: statut, page }) });
  const produits = useQuery({ queryKey: ['super-admin', 'boost-products'], queryFn: fetchBoostProducts });
  const vedettes = (produits.data?.data ?? []).filter((p) => p.kind === 'featured' && p.is_active);

  const annuler = useMutation({
    mutationFn: (v: { id: number; refund: boolean; reason: string }) =>
      avecGardeDoubleFacteur(() => cancelBoost(v.id, { refund: v.refund, reason: v.reason }), garde),
    onSuccess: () => {
      setCible(null);
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'boosts'] });
    },
    onError: (err) => setErreur(messageErreur(err, t('cancel.failed'))),
  });
  const offrir = useMutation({
    mutationFn: (v: { propertyId: number; product_id: number; reason: string }) =>
      avecGardeDoubleFacteur(() => offerBoost(v.propertyId, { product_id: v.product_id, reason: v.reason }), garde),
    onSuccess: () => {
      setOffre({ bien: '', produit: 0, motif: '' });
      setRetourOffre({ ok: true, texte: t('offer.done') });
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'boosts'] });
    },
    onError: (err) => setRetourOffre({ ok: false, texte: messageErreur(err, t('offer.failed')) }),
  });

  const ouvrir = (boost: PropertyBoost) => {
    setCible(boost);
    setRembourser(false);
    setMotif('');
    setErreur(null);
  };

  const colonnes: DataTableColumn<PropertyBoost>[] = [
    { id: 'property', header: t('colProperty'), className: 'font-medium text-foreground', cell: (b) => b.property?.title ?? `#${b.property_id}` },
    { id: 'agency', header: t('colAgency'), cell: (b) => b.agency?.name ?? `#${b.agency_id}` },
    { id: 'kind', header: t('colKind'), cell: (b) => `${t(`kinds.${b.kind}`)}${b.offered ? ` (${t('offered')})` : ''}` },
    { id: 'status', header: t('colStatus'), cell: (b) => t(`statuses.${b.status}`) },
    { id: 'end', header: t('colEnd'), cell: (b) => (b.ends_at ? f.dateTime(b.ends_at) : '—') },
    { id: 'price', header: t('colPrice'), align: 'end', cell: (b) => <span className="tabular-nums">{b.price_credits}</span> },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (b) => (VIVANTS.has(b.status) ? <Button size="sm" variant="outline" onClick={() => ouvrir(b)}>{t('cancel.open')}</Button> : null),
    },
  ];

  const bienOffert = Number(offre.bien);
  const offreValide = Number.isInteger(bienOffert) && bienOffert > 0 && offre.produit > 0 && offre.motif.trim().length >= 5;

  return (
    <div className="space-y-8">
      <div role="group" aria-label={t('statusFilter')} className="flex flex-wrap gap-2">
        {STATUTS.map((s) => (
          <Button
            key={s || 'all'}
            type="button"
            size="sm"
            variant={s === statut ? 'default' : 'outline'}
            aria-pressed={s === statut}
            onClick={() => {
              setStatut(s);
              setPage(1);
            }}
          >
            {t(`statuses.${s || 'all'}`)}
          </Button>
        ))}
      </div>

      <DataState
        loading={boosts.isLoading}
        error={boosts.isError ? t('loadError') : null}
        onRetry={() => void boosts.refetch()}
        retryLabel={t('retry')}
        isEmpty={(boosts.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        <DataTable caption={t('caption')} columns={colonnes} rows={boosts.data?.data ?? []} rowKey={(b) => b.id} />
        <Pagination page={boosts.data?.meta.current_page ?? 1} lastPage={boosts.data?.meta.last_page ?? 1} onChange={setPage} />
      </DataState>

      <section aria-labelledby="offrir" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 id="offrir" className="font-medium text-foreground">{t('offer.title')}</h2>
        <form
          className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (offreValide) offrir.mutate({ propertyId: bienOffert, product_id: offre.produit, reason: offre.motif.trim() });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="offre-bien">{t('offer.property')}</Label>
            <Input id="offre-bien" inputMode="numeric" value={offre.bien} onChange={(e) => setOffre({ ...offre, bien: e.target.value })} />
          </div>
          <div role="group" aria-label={t('offer.product')} className="flex flex-wrap gap-2">
            {vedettes.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={offre.produit === p.id ? 'default' : 'outline'}
                aria-pressed={offre.produit === p.id}
                onClick={() => setOffre({ ...offre, produit: p.id })}
              >
                {t('offer.days', { count: p.duration_days })}
              </Button>
            ))}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="offre-motif">{t('offer.reason')}</Label>
            <Textarea id="offre-motif" rows={2} value={offre.motif} onChange={(e) => setOffre({ ...offre, motif: e.target.value })} />
          </div>
          <div>
            <Button type="submit" disabled={!offreValide || offrir.isPending}>{t('offer.submit')}</Button>
          </div>
        </form>
        {retourOffre ? (
          <p role={retourOffre.ok ? 'status' : 'alert'} className={retourOffre.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retourOffre.texte}</p>
        ) : null}
      </section>

      <Dialog open={cible !== null} onOpenChange={(ouvert) => (ouvert ? null : setCible(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancel.title')}</DialogTitle>
            <DialogDescription>{cible?.property?.title ?? ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input id="annulation-remboursement" type="checkbox" className="size-4 accent-primary" checked={rembourser} onChange={(e) => setRembourser(e.target.checked)} />
              <Label htmlFor="annulation-remboursement">{t('cancel.refund')}</Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="annulation-motif">{t('cancel.reason')}</Label>
              <Textarea id="annulation-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
            {erreur ? <p role="alert" className="text-sm text-destructive">{erreur}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCible(null)}>{t('cancel.back')}</Button>
            <Button
              variant="destructive"
              disabled={motif.trim().length < 5 || annuler.isPending}
              onClick={() => cible && annuler.mutate({ id: cible.id, refund: rembourser, reason: motif.trim() })}
            >
              {t('cancel.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
