'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Download,
  FileText,
  HandCoins,
  Plus,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { IconeDeLigne, LigneDeListe, MontantDeLigne } from '@/components/ui/ligne-de-liste';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { bornesDuMois, dateDuMois, moisPrecedent } from '@/lib/finances/mois';
import { usePaymentsHistory, usePayouts } from '@/lib/queries/payments';
import type { FinanceSummary } from '@/lib/queries/agency-reporting';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { variationSurLeMoisPrecedent } from './encaissement';
import type { GestesDeLArgent } from './gestes';
import { AvatarDuPayeur, LigneDEncaissementTelephone, useLectureDEncaissement } from './LigneDEncaissement';
import type { OngletArgent } from '@/lib/finances/vue-argent';

/**
 * TCK-2659 — le POINT DU MOIS de « Argent » (maquette « Tableau du mois », approche A) : ce qui est
 * entré, ce qui manque, ce qui attend un geste — puis les derniers encaissements, nommés.
 *
 * - **Téléphone** : deux tuiles (Encaissé, Impayés), « À faire » en lignes à chevron (une ligne à
 *   zéro disparaît), « Derniers encaissements », puis « Tout voir » (les registres — « Interventions »
 *   avec `payouts.create`, TCK-2677 —, le rapprochement, l'export) et « Créer ».
 * - **Bureau** : quatre tuiles cliquables vers leur onglet, puis dès `xl` deux colonnes — « À faire »
 *   (les impayés les plus anciens, les reversements à approuver) et « Derniers encaissements ».
 *
 * Les chiffres viennent de la synthèse (`GET …/finance/summary`) et d'elle seule : aucun n'est
 * sommé à l'écran depuis une page de liste. `overdue` et les files sont l'état AU JOUR : la tuile
 * « Impayés » ne porte pas le nom du mois.
 */

export interface ContexteDuPoint {
  readonly mois: string;
  /** `?period=` tel que l'adresse le porte : les liens vers un registre le gardent. */
  readonly periodeDansLUrl: string | null;
  readonly synthese: FinanceSummary | undefined;
  readonly syntheseEnCours: boolean;
  readonly syntheseRefusee: boolean;
  readonly gestes: GestesDeLArgent;
  readonly rapprochement: boolean;
  /** `null` sans `payments.export`. */
  readonly lienExport: string | null;
}

export function lienDOnglet(onglet: OngletArgent, periode: string | null): string {
  const params = new URLSearchParams({ tab: onglet });
  if (periode) params.set('period', periode);
  return `/app/agency/finances?${params.toString()}`;
}

function useNomDuMois() {
  const f = useFormatteurs();
  return (mois: string) => f.date(dateDuMois(mois), { month: 'long', timeZone: 'UTC' });
}

function useVariation(synthese: FinanceSummary | undefined, mois: string, chiffres: number) {
  const t = useTranslations('admin.finances.argent.tuiles');
  const f = useFormatteurs();
  const nomDuMois = useNomDuMois();
  if (!synthese) return null;
  const v = variationSurLeMoisPrecedent(synthese.collected.amount, synthese.collected.previous_amount);
  if (v === null) return <span>{t('paiements', { count: synthese.collected.count })}</span>;
  const Fleche = v >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium', v >= 0 ? 'text-success' : 'text-encre-douce')}>
      <Fleche className="size-3.5" aria-hidden="true" />
      {t('variation', {
        variation: f.pourcentage(v, { signDisplay: 'exceptZero', maximumFractionDigits: chiffres }),
        mois: nomDuMois(moisPrecedent(mois)),
      })}
    </span>
  );
}

/* ────────────────────────────────────────── Téléphone ─────────────────────────────────────────── */

function Rubrique({ children, action, className }: { readonly children: ReactNode; readonly action?: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1 pb-2', className)}>
      <h2 className="text-xs font-semibold uppercase tracking-surtitre text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

const CARTE = 'overflow-hidden rounded-xl border border-border bg-card [&>*:last-child]:border-b-0';

export function PointDuMoisTelephone(ctx: ContexteDuPoint) {
  const t = useTranslations('admin.finances.argent');
  const f = useFormatteurs();
  const { synthese, gestes, periodeDansLUrl: periode } = ctx;
  const variation = useVariation(synthese, ctx.mois, 0);
  const { du, au } = bornesDuMois(ctx.mois);
  const derniers = usePaymentsHistory({ status: 'paid', paid_from: du, paid_to: au, per_page: 4, include: ['payer', 'property'] });
  const montant = (n: number) => f.montantCourt(n, synthese?.currency);

  const lignesAFaire = synthese
    ? [
        synthese.overdue.count > 0 ? (
          <LigneDeListe
            key="impayes"
            href={lienDOnglet('impayes', periode)}
            chevron
            className="min-h-15"
            debut={
              <IconeDeLigne className="bg-destructive/10 text-destructive">
                <TriangleAlert className="size-icone" strokeWidth={1.75} />
              </IconeDeLigne>
            }
            titre={t('aFaire.impayes', { count: synthese.overdue.count })}
            detail={t('aFaire.impayesDetail', { montant: montant(synthese.overdue.amount), jamais: synthese.overdue.never_reminded_count })}
          />
        ) : null,
        gestes.peutApprouver && synthese.payouts_awaiting_approval.count > 0 ? (
          <LigneDeListe
            key="a-approuver"
            href={lienDOnglet('a-approuver', periode)}
            chevron
            className="min-h-15"
            debut={
              <IconeDeLigne className="bg-warning/12 text-warning">
                <ShieldCheck className="size-icone" strokeWidth={1.75} />
              </IconeDeLigne>
            }
            titre={t('aFaire.reversements', { count: synthese.payouts_awaiting_approval.count })}
            detail={t('aFaire.reversementsDetail', {
              montant: montant(synthese.payouts_awaiting_approval.amount),
              bailleurs: synthese.payouts_awaiting_approval.landlords_count,
            })}
          />
        ) : null,
        synthese.invoices_draft.count > 0 ? (
          <LigneDeListe
            key="factures"
            href={lienDOnglet('factures', periode)}
            chevron
            className="min-h-15"
            debut={
              <IconeDeLigne>
                <ReceiptText className="size-icone" strokeWidth={1.75} />
              </IconeDeLigne>
            }
            titre={t('aFaire.factures', { count: synthese.invoices_draft.count })}
            detail={t('aFaire.facturesDetail', { montant: montant(synthese.invoices_draft.amount) })}
          />
        ) : null,
      ].filter(Boolean)
    : [];

  return (
    // TCK-2691 — pleine largeur : la marge de l'enveloppe (`py-6`) tombe, l'écran pose la maquette (`px-4 pt-4 pb-8`).
    <PagePleineLargeur data-testid="point-du-mois" className="pb-8 pt-4">
      <div className="px-4">
        {ctx.syntheseRefusee ? (
          <p className="rounded-xl border border-border bg-card p-4 text-ui text-muted-foreground">{t('syntheseRefusee')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Link href={lienDOnglet('encaissements', periode)} className="rounded-xl border border-border bg-card p-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring">
              <p className="text-ui text-muted-foreground">{t('tuiles.encaisse')}</p>
              <div className="mt-1.5 font-display text-affiche-26 font-semibold leading-none tracking-titre tabular-nums">
                {synthese ? f.montantAbrege(synthese.collected.amount, synthese.currency) : <Skeleton className="h-6 w-20" />}
              </div>
              {/* `inline-flex` comme la maquette : la ligne prend la hauteur de la ligne du parent (24 px), pas 19 px. */}
              <p className="mt-2.5 inline-flex items-center text-xs">{variation}</p>
            </Link>
            <Link
              href={lienDOnglet('impayes', periode)}
              className="rounded-xl border border-destructive/20 bg-destructive/6 p-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <p className="flex items-center justify-between text-ui font-medium text-destructive">
                {t('tuiles.impayes')} <TriangleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </p>
              <div className="mt-1.5 font-display text-affiche-26 font-semibold leading-none tracking-titre tabular-nums">
                {synthese ? f.montantAbrege(synthese.overdue.amount, synthese.currency) : <Skeleton className="h-6 w-20" />}
              </div>
              <p className="mt-2.5 text-xs font-medium text-encre-douce">
                {synthese ? t('tuiles.bauxEnRetard', { count: synthese.overdue.leases_count }) : null}
              </p>
            </Link>
          </div>
        )}

        {lignesAFaire.length > 0 ? (
          <section className="mt-6">
            <Rubrique>{t('aFaire.titre')}</Rubrique>
            <div className={CARTE}>{lignesAFaire}</div>
          </section>
        ) : null}

        <section className="mt-6">
          <Rubrique
            action={
              <Link href={lienDOnglet('encaissements', periode)} className="inline-flex items-center gap-0.5 text-sm font-medium text-primary">
                {t('derniers.tout')} <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            }
          >
            {t('derniers.titre')}
          </Rubrique>
          <ListeDesDerniers rows={derniers.data?.data} chargement={derniers.isLoading} />
        </section>

        <section className="mt-6">
          <Rubrique>{t('registres.titre')}</Rubrique>
          <div className={CARTE}>
            <LigneRegistre href={lienDOnglet('encaissements', periode)} icone={<Wallet />} titre={t('registres.encaissements')} droite={derniers.data?.meta.total} />
            <LigneRegistre href={lienDOnglet('factures', periode)} icone={<FileText />} titre={t('registres.factures')} />
            <LigneRegistre href={lienDOnglet('reversements', periode)} icone={<HandCoins />} titre={t('registres.reversements')} droite={synthese?.payouts_open.count} />
            {gestes.peutApprouver ? (
              <LigneRegistre href={lienDOnglet('a-approuver', periode)} icone={<ShieldCheck />} titre={t('registres.aApprouver')} droite={synthese?.payouts_awaiting_approval.count} />
            ) : null}
            {/* TCK-2677 — les factures des prestataires, que l'onglet `bills` de `/app/payments` servait seul. */}
            {gestes.peutPayerLesPrestataires ? (
              <LigneRegistre href={lienDOnglet('interventions', periode)} icone={<Wrench />} titre={t('registres.interventions')} detail={t('registres.interventionsDetail')} />
            ) : null}
            <LigneRegistre
              href={lienDOnglet('impayes', periode)}
              icone={<TriangleAlert />}
              titre={t('registres.impayes')}
              detail={t('registres.impayesDetail')}
              droite={synthese?.overdue.count}
            />
            {ctx.rapprochement ? (
              <LigneRegistre href="/app/agency/finances/reconciliation" icone={<ArrowLeftRight />} titre={t('registres.rapprochement')} />
            ) : null}
            {ctx.lienExport ? (
              <a
                href={ctx.lienExport}
                download
                data-slot="ligne-de-liste"
                className="flex min-h-15 w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <IconeDeLigne>
                  <Download className="size-icone" strokeWidth={1.75} />
                </IconeDeLigne>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate text-corps font-medium">{t('registres.exporter')}</span>
                  <span className="block truncate text-ui text-muted-foreground">{t('registres.exporterDetail')}</span>
                </span>
                <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </section>

        {gestes.canEmit && gestes.capacitesEnCours ? (
          <Skeleton className="mt-6 h-32 rounded-xl" aria-hidden="true" data-testid="finances-actions-loading" />
        ) : gestes.emetFacture || gestes.emetReversement ? (
          <section className="mt-6">
            <Rubrique>{t('creer.titre')}</Rubrique>
            <div className={CARTE}>
              {gestes.emetReversement ? (
                <LigneDeListe onClick={gestes.nouveauReversement} chevron className="min-h-15" debut={<IconeDeLigne><Plus className="size-icone" /></IconeDeLigne>} titre={t('creer.reversement')} />
              ) : null}
              {gestes.emetFacture ? (
                <LigneDeListe
                  onClick={gestes.nouvelleFacture}
                  chevron
                  className="min-h-15"
                  debut={
                    <IconeDeLigne>
                      <ReceiptText className="size-icone" strokeWidth={1.75} />
                    </IconeDeLigne>
                  }
                  titre={t('creer.facture')}
                  detail={
                    synthese && synthese.invoices_draft.count > 0
                      ? t('creer.factureDetail', { count: synthese.invoices_draft.count, montant: montant(synthese.invoices_draft.amount) })
                      : undefined
                  }
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </PagePleineLargeur>
  );
}

function LigneRegistre({
  href,
  icone,
  titre,
  detail,
  droite,
}: {
  readonly href: string;
  readonly icone: ReactNode;
  readonly titre: string;
  readonly detail?: string;
  readonly droite?: number;
}) {
  const f = useFormatteurs();
  return (
    <LigneDeListe
      href={href}
      chevron
      className="min-h-15"
      debut={<IconeDeLigne className="[&_svg]:size-icone [&_svg]:stroke-[1.75]">{icone}</IconeDeLigne>}
      titre={titre}
      detail={detail}
      fin={droite !== undefined ? <MontantDeLigne className="font-normal text-muted-foreground">{f.nombre(droite)}</MontantDeLigne> : undefined}
    />
  );
}

function ListeDesDerniers({ rows, chargement }: { readonly rows: readonly PaymentHistoryRow[] | undefined; readonly chargement: boolean }) {
  const t = useTranslations('admin.finances.argent.derniers');
  if (chargement) return <Skeleton className="h-60 rounded-xl" />;
  if (!rows || rows.length === 0) return <p className="rounded-xl border border-border bg-card p-4 text-ui text-muted-foreground">{t('vide')}</p>;
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {rows.map((row) => (
        <LigneDEncaissementTelephone key={`${row.source}-${row.id}`} row={row} />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────── Bureau ──────────────────────────────────────────── */

function TuileBureau({
  href,
  libelle,
  valeur,
  detail,
  danger,
}: {
  readonly href: string;
  readonly libelle: string;
  readonly valeur: ReactNode;
  readonly detail: ReactNode;
  readonly danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-xl border p-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
        danger ? 'border-destructive/20 bg-destructive/5 hover:bg-destructive/8' : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      <p className={cn('flex items-center text-ui', danger ? 'font-medium text-destructive' : 'text-muted-foreground')}>
        {libelle}
        <ArrowUpRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </p>
      <div className="mt-2 font-display text-affiche-28 font-semibold leading-none tracking-titre tabular-nums">{valeur}</div>
      <p className="mt-2.5 text-ui text-muted-foreground">{detail}</p>
    </Link>
  );
}

export function TuilesDuMois(ctx: ContexteDuPoint) {
  const t = useTranslations('admin.finances');
  const f = useFormatteurs();
  const nomDuMois = useNomDuMois();
  const { synthese, periodeDansLUrl: periode } = ctx;
  const variation = useVariation(synthese, ctx.mois, 1);
  const montant = (n: number) => f.montantCourt(n, synthese?.currency);
  const attente = <Skeleton className="h-7 w-40" />;
  // TCK-2720 — « N bailleurs · M à approuver » (la maquette), lus sur l'UNION des deux files : un
  // bailleur qui attend un reversement à approuver ET un autre à verser n'y compte qu'une fois. Sans
  // bailleur (que des prestataires ou des cautions rendues), le nombre de reversements.
  const detailDesReversements = ({ payouts_open: ouverts, payouts_awaiting_approval: aApprouver }: FinanceSummary) =>
    ouverts.landlords_count > 0
      ? t('argent.tuiles.reversementsBailleurs', { bailleurs: ouverts.landlords_count, aApprouver: aApprouver.count })
      : t('argent.tuiles.reversementsDetail', { count: ouverts.count, aApprouver: aApprouver.count });

  if (ctx.syntheseRefusee) {
    return <p className="rounded-xl border border-border bg-card p-4 text-ui text-muted-foreground">{t('argent.syntheseRefusee')}</p>;
  }

  return (
    <div data-testid="tuiles-du-mois" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <TuileBureau
        href={lienDOnglet('encaissements', periode)}
        libelle={t('kpis.collectedIn', { mois: nomDuMois(ctx.mois) })}
        valeur={synthese ? montant(synthese.collected.amount) : attente}
        detail={variation}
      />
      <TuileBureau
        danger
        href={lienDOnglet('impayes', periode)}
        libelle={t('kpis.overdue')}
        valeur={synthese ? montant(synthese.overdue.amount) : attente}
        detail={
          synthese
            ? t('argent.tuiles.bauxEtAnciens', { baux: synthese.overdue.leases_count, anciens: synthese.overdue.by_age.over_30.count })
            : null
        }
      />
      <TuileBureau
        href={lienDOnglet('reversements', periode)}
        libelle={t('kpis.pendingPayouts')}
        valeur={synthese ? montant(synthese.payouts_open.amount) : attente}
        detail={synthese ? detailDesReversements(synthese) : null}
      />
      <TuileBureau
        href={lienDOnglet('factures', periode)}
        libelle={t('kpis.invoicesToIssue')}
        valeur={synthese ? f.nombre(synthese.invoices_draft.count) : attente}
        detail={synthese ? t('argent.tuiles.facturesDetail', { montant: montant(synthese.invoices_draft.amount) }) : null}
      />
    </div>
  );
}

// Les largeurs de la maquette (116 px, 124 px ; colonne droite 432 px, gauche 580 px au moins), sur
// l'échelle du bureau (`--spacing` = 3,6 px dès `lg`, ADR-0107) : K = px ÷ 3,6.
const COLS_IMPAYE = 'grid-cols-[minmax(0,1fr)_calc(var(--spacing)*32)_calc(var(--spacing)*34.5)]';
// Les hauteurs de rangée, elles, sont des tailles fixes de la maquette (56 px, 60 px à toute densité) :
// en `rem` (3,5 et 3,75), jamais `min-h-14` / `min-h-15`, que la densité ramène à 50 et 54 px.

/** Bureau : « À faire » (les impayés les plus anciens, les reversements à approuver) et « Derniers encaissements ». */
export function AFaireEtDerniers(ctx: ContexteDuPoint) {
  const t = useTranslations('admin.finances.argent');
  const f = useFormatteurs();
  const l = useLectureDEncaissement();
  const { synthese, gestes, periodeDansLUrl: periode } = ctx;
  const { du, au } = bornesDuMois(ctx.mois);
  const anciens = usePaymentsHistory({ days_late_min: 1, sort: '-days_late', per_page: 5, include: ['payer', 'property', 'reminders'] });
  const aApprouver = usePayouts({ status: 'awaiting_approval', per_page: 3, enabled: gestes.peutApprouver && (synthese?.payouts_awaiting_approval.count ?? 0) > 0 });
  const derniers = usePaymentsHistory({ status: 'paid', paid_from: du, paid_to: au, per_page: 8, include: ['payer', 'property'] });
  const lignesAnciennes = anciens.data?.data ?? [];
  const reversements = aApprouver.data?.data ?? [];

  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_min(calc(var(--spacing)*120),calc(100%-var(--spacing)*161))]">
      <div className="space-y-6">
        {lignesAnciennes.length > 0 ? (
          <Card className="gap-0 py-0">
            <CardHeader filet>
              <CardTitle>{t('aFaire.plusAnciens')}</CardTitle>
              <CardAction>
                <Link href={lienDOnglet('impayes', periode)}>{t('aFaire.voirLes', { count: synthese?.overdue.count ?? anciens.data?.meta.total ?? 0 })}</Link>
              </CardAction>
            </CardHeader>
            <div className="max-xl:overflow-x-auto">
              <ul className="min-w-144">
                {lignesAnciennes.map((row) => {
                  const nom = l.nom(row);
                  const retard = row.days_late ?? 0;
                  return (
                    <li key={`${row.source}-${row.id}`} className={cn('grid min-h-[3.5rem] items-center gap-x-4 border-t border-border px-4 py-2 text-sm first:border-t-0', COLS_IMPAYE)}>
                      <PersonneDeLaLigne nom={nom} detail={l.bien(row)} />
                      <span className="text-right leading-tight">
                        <span className="block font-semibold tabular-nums">{l.montant(row)}</span>
                        <span className={cn('mt-0.5 block text-ui', retard > 30 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                          {t('aFaire.joursDeRetardCourt', { count: retard })}
                        </span>
                      </span>
                      <span className="truncate text-ui text-muted-foreground">
                        {row.last_reminder ? t('aFaire.relanceLe', { date: f.jourMois(row.last_reminder.at) }) : t('aFaire.jamaisRelance')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        ) : null}

        {reversements.length > 0 ? (
          <Card className="gap-0 py-0">
            <CardHeader filet>
              <CardTitle>{t('aFaire.aApprouverTitre')}</CardTitle>
              <CardAction>
                <Link href={lienDOnglet('a-approuver', periode)}>{t('aFaire.voirLes', { count: synthese?.payouts_awaiting_approval.count ?? reversements.length })}</Link>
              </CardAction>
            </CardHeader>
            <ul>
              {reversements.map((p) => (
                <li key={p.id} className="flex min-h-[3.5rem] items-center gap-4 border-t border-border px-4 py-2 text-sm first:border-t-0">
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-medium">{p.reference_number ?? t('aFaire.reversementSansReference')}</span>
                    <span className="mt-0.5 block truncate text-ui text-muted-foreground">
                      {[
                        p.period_start ? f.date(p.period_start, { month: 'long', year: 'numeric' }) : null,
                        p.payout_method_masked ?? null,
                        p.issuer?.name ? t('aFaire.preparePar', { nom: p.issuer.name }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex-none text-right font-semibold tabular-nums">{f.montantCourt(p.net_amount, p.currency)}</span>
                  <Button type="button" size="sm" onClick={() => gestes.ouvrirReversement(p.id)}>
                    {t('aFaire.examiner')}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <Card className="gap-0 py-0">
        <CardHeader filet>
          <CardTitle>{t('derniers.titre')}</CardTitle>
          <CardAction>
            <Link href={lienDOnglet('encaissements', periode)}>{t('derniers.toutVoir')}</Link>
          </CardAction>
        </CardHeader>
        {derniers.isLoading ? (
          <Skeleton className="m-4 h-60" />
        ) : (derniers.data?.data ?? []).length === 0 ? (
          <p className="p-4 text-ui text-muted-foreground">{t('derniers.vide')}</p>
        ) : (
          <ul>
            {(derniers.data?.data ?? []).map((row) => (
              <li key={`${row.source}-${row.id}`} className="flex min-h-[3.75rem] items-center gap-3 border-t border-border px-4 py-2 text-sm first:border-t-0">
                <PersonneDeLaLigne
                  nom={
                    <span className="flex min-w-0 min-[90rem]:block">
                      <span className="max-w-full shrink-0 truncate min-[90rem]:inline">{l.nom(row)}</span>{' '}
                      <span className="min-w-0 truncate pl-1 font-normal text-muted-foreground min-[90rem]:inline min-[90rem]:pl-0">· {l.periode(row, true)}</span>
                    </span>
                  }
                  initiales={l.nom(row)}
                  detail={l.bien(row)}
                />
                <span className="ml-auto flex-none text-right leading-tight">
                  <span className="block font-semibold tabular-nums">{l.montant(row)}</span>
                  <span className="mt-0.5 block text-ui text-muted-foreground">{[l.moyen(row), l.quand(row)].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PersonneDeLaLigne({ nom, initiales, detail }: { readonly nom: ReactNode; readonly initiales?: string; readonly detail?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AvatarDuPayeur nom={initiales ?? (typeof nom === 'string' ? nom : '')} taille="32" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-medium">{nom}</span>
        {detail ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{detail}</span> : null}
      </span>
    </span>
  );
}
