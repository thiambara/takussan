'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, DataTable, type DataTableColumn } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import type { BoostKind, BoostProduct, BoostVariant } from '../types';
import { createBoostProduct, fetchBoostProducts, updateBoostProduct } from './api';

const GENRES: readonly BoostKind[] = ['bump', 'featured', 'badge'];
const VARIANTES: readonly BoostVariant[] = ['urgent', 'price_drop'];

/** TCK-633 lot F (ADR-0061 §4) — le catalogue : prix, activation, nouvelle offre. Sans redéploiement. */
export function AdminBoostCatalogue() {
  const t = useTranslations('superAdmin.boosts');
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [prix, setPrix] = useState<Record<number, string>>({});
  const [retour, setRetour] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);
  const [nouvelle, setNouvelle] = useState<{ kind: BoostKind; variant: BoostVariant; duration: string; price: string }>({
    kind: 'featured', variant: 'urgent', duration: '', price: '',
  });

  const produits = useQuery({ queryKey: ['super-admin', 'boost-products'], queryFn: fetchBoostProducts });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'boost-products'] });
  const echec = (err: unknown) => setRetour({ ok: false, texte: messageErreur(err, t('catalogue.failed')) });

  const modifier = useMutation({
    mutationFn: (v: { id: number; price_credits?: number; is_active?: boolean }) =>
      avecGardeDoubleFacteur(() => updateBoostProduct(v.id, { price_credits: v.price_credits, is_active: v.is_active }), garde),
    onSuccess: () => {
      setRetour({ ok: true, texte: t('catalogue.saved') });
      return rafraichir();
    },
    onError: echec,
  });
  const creer = useMutation({
    mutationFn: () =>
      avecGardeDoubleFacteur(
        () =>
          createBoostProduct({
            kind: nouvelle.kind,
            variant: nouvelle.kind === 'badge' ? nouvelle.variant : null,
            duration_days: nouvelle.kind === 'bump' ? 0 : Number(nouvelle.duration),
            price_credits: Number(nouvelle.price),
          }),
        garde,
      ),
    onSuccess: () => {
      setNouvelle({ kind: 'featured', variant: 'urgent', duration: '', price: '' });
      setRetour({ ok: true, texte: t('catalogue.saved') });
      return rafraichir();
    },
    onError: echec,
  });

  const libelle = (p: BoostProduct) => (p.kind === 'badge' && p.variant ? `${t('kinds.badge')} — ${t(`variants.${p.variant}`)}` : t(`kinds.${p.kind}`));
  const colonnes: DataTableColumn<BoostProduct>[] = [
    { id: 'kind', header: t('catalogue.colKind'), className: 'font-medium text-foreground', cell: libelle },
    { id: 'duration', header: t('catalogue.colDuration'), cell: (p) => t('catalogue.days', { count: p.duration_days }) },
    {
      id: 'price',
      header: t('catalogue.colPrice'),
      cell: (p) => (
        <Input
          aria-label={`${t('catalogue.colPrice')} — ${libelle(p)}`}
          inputMode="numeric"
          className="w-24"
          value={prix[p.id] ?? String(p.price_credits)}
          onChange={(e) => setPrix({ ...prix, [p.id]: e.target.value })}
        />
      ),
    },
    {
      id: 'active',
      header: t('catalogue.colActive'),
      cell: (p) => (
        <input
          type="checkbox"
          className="size-4 accent-primary"
          aria-label={`${t('catalogue.colActive')} — ${libelle(p)}`}
          checked={p.is_active}
          onChange={(e) => modifier.mutate({ id: p.id, is_active: e.target.checked })}
        />
      ),
    },
    {
      id: 'save',
      header: t('catalogue.save'),
      headerSrOnly: true,
      align: 'end',
      cell: (p) => (
        <Button
          size="sm"
          variant="outline"
          disabled={prix[p.id] === undefined || !/^\d+$/.test(prix[p.id] ?? '') || modifier.isPending}
          onClick={() => modifier.mutate({ id: p.id, price_credits: Number(prix[p.id]) })}
        >
          {t('catalogue.save')}
        </Button>
      ),
    },
  ];

  const creationValide = /^\d+$/.test(nouvelle.price) && (nouvelle.kind === 'bump' || /^[1-9]\d*$/.test(nouvelle.duration));

  return (
    <div className="space-y-8">
      {retour ? (
        <p role={retour.ok ? 'status' : 'alert'} className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{retour.texte}</p>
      ) : null}
      <DataState loading={produits.isLoading} error={produits.isError ? t('loadError') : null} onRetry={() => void produits.refetch()} retryLabel={t('retry')}>
        <DataTable caption={t('catalogue.caption')} columns={colonnes} rows={produits.data?.data ?? []} rowKey={(p) => p.id} />
      </DataState>

      <section aria-labelledby="nouvelle-offre" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 id="nouvelle-offre" className="font-medium text-foreground">{t('catalogue.createTitle')}</h2>
        <div role="group" aria-label={t('catalogue.kind')} className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Button key={g} type="button" size="sm" variant={nouvelle.kind === g ? 'default' : 'outline'} aria-pressed={nouvelle.kind === g} onClick={() => setNouvelle({ ...nouvelle, kind: g })}>
              {t(`kinds.${g}`)}
            </Button>
          ))}
        </div>
        {nouvelle.kind === 'badge' ? (
          <div role="group" aria-label={t('catalogue.variant')} className="flex flex-wrap gap-2">
            {VARIANTES.map((v) => (
              <Button key={v} type="button" size="sm" variant={nouvelle.variant === v ? 'default' : 'outline'} aria-pressed={nouvelle.variant === v} onClick={() => setNouvelle({ ...nouvelle, variant: v })}>
                {t(`variants.${v}`)}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {nouvelle.kind !== 'bump' ? (
            <div className="space-y-1">
              <Label htmlFor="offre-duree">{t('catalogue.duration')}</Label>
              <Input id="offre-duree" inputMode="numeric" value={nouvelle.duration} onChange={(e) => setNouvelle({ ...nouvelle, duration: e.target.value })} />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="offre-prix">{t('catalogue.price')}</Label>
            <Input id="offre-prix" inputMode="numeric" value={nouvelle.price} onChange={(e) => setNouvelle({ ...nouvelle, price: e.target.value })} />
          </div>
          <div>
            <Button type="button" disabled={!creationValide || creer.isPending} onClick={() => creer.mutate()}>{t('catalogue.create')}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
