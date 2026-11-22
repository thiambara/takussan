'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MessageSquareText, Phone } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AGING_BUCKETS, useAgingBalance } from '@/lib/queries/agency-reporting';
import { useDepositRefundState } from '@/lib/queries/leases';
import { usePaymentsHistory } from '@/lib/queries/payments';
import { useRelancesDeLEcheance, type RelanceDUneEcheance } from '@/lib/queries/relances';
import type { PaymentHistoryRow } from '@/types/invoice';

import { AvatarDuPayeur } from '../argent/LigneDEncaissement';
import { useLectureDImpaye } from './lecture';
import { LienDePaiement } from './RelanceDUnImpaye';

/**
 * TCK-2660 — le dossier d'un impayé, dans le panneau latéral du bureau (maquette `DossierImpaye`) :
 * le bien et le bailleur, ce qui est dû depuis combien de jours, les échéances dues du même
 * locataire (la même règle *Impayé*), la pénalité, la caution détenue, le lien de paiement et
 * l'historique des relances — notées ET automatiques, fusionnées par l'API (ADR-0105 § 3).
 * `milieu` reçoit la relance en cours de composition. Aucun « Lu le … » : rien ne le mesure.
 */
export function DossierDImpaye({
  agencyId,
  row,
  url,
  creerLeLien,
  milieu,
}: {
  readonly agencyId?: number;
  readonly row: PaymentHistoryRow;
  readonly url: string | null;
  /** Décision 1 du porteur (2026-11-12) — « Copier » crée le lien : ouvrir le dossier n'en crée aucun. */
  readonly creerLeLien?: () => Promise<string | null>;
  readonly milieu?: ReactNode;
}) {
  const t = useTranslations('admin.finances.impayes.dossier');
  const tImpayes = useTranslations('admin.finances.impayes');
  const f = useFormatteurs();
  const l = useLectureDImpaye();
  const payee = row.status === 'paid';
  const fiche = row.payer?.id ? `/app/customers/${row.payer.id}` : null;
  const echeances = usePaymentsHistory({
    payer_id: row.payer?.id,
    days_late_min: 1,
    sort: '-days_late',
    per_page: 20,
    enabled: Boolean(row.payer?.id),
  });
  const caution = useDepositRefundState(row.lease_id);
  const detenue = caution.data?.data.deposit_remaining ?? null;
  const penalite = row.late_fee_amount ?? 0;

  return (
    <div data-slot="dossier-impaye">
      <div className="flex items-center gap-3">
        <AvatarDuPayeur nom={l.nom(row)} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-corps font-semibold">{l.bien(row) ?? '—'}</p>
          <p className="mt-1 truncate text-ui text-muted-foreground">
            {[row.landlord?.name ? t('bailleur', { nom: row.landlord.name }) : null, row.payer?.phone ?? null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {fiche ? (
          <Link href={fiche} className="flex-none text-sm font-medium text-primary underline-offset-2 hover:underline">
            {tImpayes('gestes.ficheClient')}
          </Link>
        ) : null}
      </div>

      {payee ? (
        <p role="status" className="mt-5 rounded-xl bg-success/10 p-4 text-sm font-medium text-success">
          {t('payee')}
        </p>
      ) : (
        <div className="mt-5 rounded-xl border border-bord-danger bg-destructive/5 p-4">
          <p className="text-ui font-medium text-destructive">{t('duDepuis', { count: row.days_late ?? 0 })}</p>
          <p className="mt-1 font-display text-affiche-28 leading-none font-semibold tracking-titre tabular-nums">{l.montantDu(row)}</p>
        </div>
      )}
      {milieu}

      <p className="mt-8 mb-1 text-sm font-semibold">{t('echeances')}</p>
      <div className="divide-y divide-border text-sm">
        {echeances.isPending ? (
          <Skeleton className="h-10 rounded-md" aria-hidden="true" />
        ) : (
          (echeances.data?.data ?? (payee ? [] : [row])).map((e) => (
            <LigneCle key={`${e.source}-${e.id}`} libelle={t('echeance', { periode: l.periode(e), date: e.due_date ? f.jourMois(`${e.due_date}T12:00:00Z`) : '—' })}>
              {l.montantDu(e)}
            </LigneCle>
          ))
        )}
        {penalite > 0 ? (
          <LigneCle libelle={row.late_fee_payable_online ? t('penalite') : t('penaliteHorsLien')}>{f.montantCourt(penalite, row.currency)}</LigneCle>
        ) : null}
        {detenue !== null && detenue > 0 ? <LigneCle libelle={t('caution')}>{f.montantCourt(detenue, row.currency)}</LigneCle> : null}
      </div>


      {/* La relance en cours porte déjà le lien (et son « Copier ») : le dossier ne le répète pas. */}
      {payee || milieu ? null : (
        <>
          <p className="mt-6 mb-1.5 text-sm font-semibold">{t('lien')}</p>
          <LienDePaiement url={url} creer={creerLeLien} />
          <p className="mt-1.5 text-ui text-muted-foreground">{t('lienAide')}</p>
        </>
      )}

      <p className="mt-6 mb-2 text-sm font-semibold">{t('relances')}</p>
      <HistoriqueDesRelances paymentId={row.id} />

      <AncienneteDuDu agencyId={agencyId} clientId={row.payer?.id ?? null} devise={row.currency} />
    </div>
  );
}

/**
 * Une ligne clé du dossier : un libellé et sa valeur, sans geste — pas de cible tactile (`min-h-11`),
 * `py-2` seulement, comme la maquette regelée (33,4 px à 1280 ; 39,6 avec la cible, TCK-2840).
 */
function LigneCle({ libelle, children }: { readonly libelle: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1 text-muted-foreground">{libelle}</span>
      <span className="flex-none font-medium tabular-nums">{children}</span>
    </div>
  );
}

function HistoriqueDesRelances({ paymentId }: { readonly paymentId: number }) {
  const t = useTranslations('admin.finances.impayes.dossier');
  const f = useFormatteurs();
  const l = useLectureDImpaye();
  const relances = useRelancesDeLEcheance(paymentId);
  if (relances.isPending) return <Skeleton className="h-16 rounded-md" aria-hidden="true" />;
  const liste = relances.data?.data ?? [];
  if (liste.length === 0) return <p className="text-sm text-muted-foreground">{t('aucuneRelance')}</p>;
  return (
    <ol className="space-y-3" data-slot="historique-des-relances">
      {liste.map((r, i) => (
        <li key={`${r.at}-${i}`} className="flex gap-3 text-sm">
          <span className="mt-0.5 inline-flex size-7 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
            <IconeDeRelance relance={r} />
          </span>
          <span className="min-w-0 leading-snug">
            <span className="block font-medium">
              {f.jourMois(r.at)} · {l.canal(r)}{' '}
              <span className="font-normal text-muted-foreground">· {r.source === 'automatic' ? jalon(t, r.milestone) : (r.by?.name ?? '—')}</span>
            </span>
            {r.note ? <span className="block text-ui text-muted-foreground">{r.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function IconeDeRelance({ relance }: { readonly relance: RelanceDUneEcheance }) {
  if (relance.channel === 'whatsapp') return <IconeWhatsApp className="size-3.5 lg:size-3.5" />;
  if (relance.channel === 'call') return <Phone className="size-3.5" aria-hidden="true" />;
  return <MessageSquareText className="size-3.5" aria-hidden="true" />;
}

/** `due_soon` → « avant l'échéance » ; `overdue_7` → « 7 j après l'échéance ». */
function jalon(t: ReturnType<typeof useTranslations<'admin.finances.impayes.dossier'>>, milestone: string | null): string {
  if (milestone === 'due_soon') return t('jalon.avant');
  const jours = Number(/^overdue_(\d+)$/.exec(milestone ?? '')?.[1] ?? Number.NaN);
  return Number.isFinite(jours) ? t('jalon.apres', { count: jours }) : t('jalon.inconnu');
}

/**
 * Le dû de CE locataire par ancienneté (1–30, 31–60, 61–90, plus de 90 jours) : ce que montrait l'âge
 * des créances par locataire, que la liste par échéance a remplacé (TCK-2660, décision 3 : rien ne se
 * perd). Lu dans la balance âgée par locataire, déjà chargée par l'en-tête (même clé de cache).
 */
function AncienneteDuDu({
  agencyId,
  clientId,
  devise,
}: {
  readonly agencyId: number | undefined;
  readonly clientId: number | null;
  readonly devise: string | null | undefined;
}) {
  const t = useTranslations('admin.finances.impayes.dossier');
  const tAge = useTranslations('admin.finances.aging');
  const f = useFormatteurs();
  const aging = useAgingBalance(agencyId, 'tenant');
  const ligne = clientId === null ? undefined : aging.data?.data.rows.find((r) => r.id === clientId);
  if (!ligne) return null;
  return (
    <>
      <p className="mt-6 mb-1 text-sm font-semibold">{t('anciennete')}</p>
      <div className="divide-y divide-border text-sm" data-slot="anciennete-du-du">
        {AGING_BUCKETS.map((tranche) => (
          <LigneCle key={tranche} libelle={tAge(`buckets.${tranche}`)}>
            {ligne.buckets[tranche].count > 0 ? f.montantCourt(ligne.buckets[tranche].amount, devise) : '—'}
          </LigneCle>
        ))}
      </div>
    </>
  );
}
