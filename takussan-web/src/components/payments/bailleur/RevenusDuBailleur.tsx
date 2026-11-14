'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock, Check, ChevronRight, Clock, FileSpreadsheet, FileText, House } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import { dateDuMois } from '@/lib/finances/mois';
import { usePaymentsHistory, usePayouts } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import type { OwnerStatement, OwnerStatementProperty, OwnerStatementTotals, PayoutStatus } from '@/types/invoice';

import { PAYOUT_STATUS_TONE } from '../constants';
import { estAnnee, tauxUnique } from './adresse';
import type { FormatDuReleve } from './useTelechargerLeReleve';

/** TCK-2321 — les totaux que le rectificatif peut faire bouger, dans leur ordre, et leur libellé. */
const TOTAUX_DU_RECTIFICATIF: readonly (readonly [keyof OwnerStatementTotals, string])[] = [
  ['gross', 'gross'],
  ['commission', 'commission'],
  ['fees', 'fees'],
  ['net', 'net'],
  ['paid_out', 'paidOut'],
  ['clawback', 'clawback'],
];

export interface TelechargementDuReleve {
  readonly telecharger: (period: string, format: FormatDuReleve) => void;
  readonly enCours: string | null;
  readonly erreur: string | null;
}

interface RevenusDuBailleurProps {
  readonly releve: OwnerStatement | undefined;
  readonly chargement: boolean;
  readonly erreur: string | null;
  readonly periode: string;
  /** L'utilisateur connecté : le registre ne lit que les opérations de SES biens (`filter[landlord_id]`). */
  readonly bailleurId: number | null;
  readonly telechargement: TelechargementDuReleve;
}

/**
 * TCK-2651 (maquette `app-paiements`, approche A, « Bailleur — Mes revenus ») — l'onglet « Revenus » de
 * la page « Loyers ».
 *
 * - **Reste à vous verser** : `balance.remaining_to_pay`, le solde cumulé AU JOUR (TCK-2760, ADR-0100
 *   amendé le 2026-11-12), qui ne suit pas le mois choisi. Jamais `totals.remaining_to_pay` (l'écart du
 *   mois), jamais une soustraction : sans `balance`, « — ».
 * - **La ventilation** est celle de la période choisie : Encaissé · Commission · Interventions · Net ·
 *   Déjà versé. Elle ne se clôt pas sur « Reste à vous verser » (ADR-0100, amendement § 7) : le reste
 *   n'est pas Net − Déjà versé du mois.
 * - **Documents** (téléphone ; au bureau, dans l'en-tête) : le relevé de la période et l'attestation
 *   annuelle, en PDF et en CSV.
 * - **Par bien** : `properties[]`, une ligne par élément, le bien et son locataire nommés.
 * - Au bureau, deux colonnes dès `lg` (le relevé, puis le tableau par bien et les derniers versements).
 */
export function RevenusDuBailleur({ releve, chargement, erreur, periode, bailleurId, telechargement }: RevenusDuBailleurProps) {
  const t = useTranslations('payments.bailleur');

  if (chargement) {
    return (
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6 lg:space-y-0" aria-busy="true">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (erreur || !releve) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-destructive">
        {erreur ?? t('erreur')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6 xl:grid-cols-[25rem_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5 lg:space-y-4">
        <TeteDuReste releve={releve} />
        <Ventilation releve={releve} periode={periode} />
        <DocumentsDuReleve periode={periode} telechargement={telechargement} className="md:hidden" />
      </div>
      <div className="min-w-0 space-y-5 lg:space-y-6">
        <ParBien releve={releve} periode={periode} />
        <LienDesOperations periode={periode} bailleurId={bailleurId} className="lg:hidden" />
        <DerniersVersements className="hidden lg:block" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────── Reste à vous verser ─────────────────────────────────────── */

export function TeteDuReste({ releve }: { readonly releve: OwnerStatement }) {
  const t = useTranslations('payments.bailleur.tete');
  const tMoyens = useTranslations('payments.methods');
  const f = useFormatteurs();
  const solde = releve.balance;
  const prochain = releve.next_payout ?? null;
  const moyen = prochain?.payment_method
    ? tMoyens.has(prochain.payment_method)
      ? tMoyens(prochain.payment_method)
      : prochain.payment_method.replace(/_/g, ' ')
    : null;
  const gras = (morceau: React.ReactNode) => <span className="font-semibold">{morceau}</span>;

  return (
    <section aria-labelledby="reste-a-vous-verser" data-slot="tete-du-reste" className="rounded-2xl bg-secondary p-5 lg:p-6">
      <p id="reste-a-vous-verser" className="text-sm font-semibold text-primary-deep">
        {t('reste')}
      </p>
      <p className="mt-1.5 font-display text-affiche-40 leading-none font-semibold tracking-titre tabular-nums text-foreground" data-testid="reste-a-verser">
        {/* TCK-2760 — le solde cumulé au jour ; jamais l'écart du mois (`totals.remaining_to_pay`). */}
        {solde ? f.montantCourt(solde.remaining_to_pay, releve.currency) : '—'}
      </p>
      {prochain ? (
        <p className="mt-3.5 flex items-start gap-2 text-corps leading-snug text-foreground" data-testid="prochain-versement">
          <CalendarClock className="mt-0.5 size-icone flex-none text-primary-deep" strokeWidth={1.75} aria-hidden="true" />
          <span>
            {prochain.scheduled_at
              ? moyen
                ? t.rich('prochain', { date: f.jourMois(prochain.scheduled_at), moyen, b: gras })
                : t.rich('prochainSansMoyen', { date: f.jourMois(prochain.scheduled_at), b: gras })
              : t('enPreparation')}
          </span>
        </p>
      ) : null}
    </section>
  );
}

/* ─────────────────────────────────────────── Ventilation ─────────────────────────────────────────── */

function Ligne({ libelle, valeur, fort, className }: { readonly libelle: React.ReactNode; readonly valeur: string; readonly fort?: boolean; readonly className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2 text-sm', fort && 'text-corps font-semibold', className)}>
      <dt className={fort ? 'text-foreground' : 'text-muted-foreground'}>{libelle}</dt>
      <dd className="flex-none text-right tabular-nums text-foreground">{valeur}</dd>
    </div>
  );
}

function Ventilation({ releve, periode }: { readonly releve: OwnerStatement; readonly periode: string }) {
  const t = useTranslations('payments.bailleur.ventilation');
  const tReleve = useTranslations('payments.ownerStatement');
  const f = useFormatteurs();
  const annuel = estAnnee(periode);
  const devise = releve.currency;
  const m = (valeur: number) => f.montantCourt(valeur, devise);
  // « 0 F », jamais « − 0 F » ni « -0 F » : un signe ne se pose que sur un montant non nul.
  const retenu = (valeur: number) => (valeur === 0 ? m(0) : `− ${m(Math.abs(valeur))}`);
  const totaux = releve.totals;
  const taux = tauxUnique(releve.lines);
  const biens = releve.properties ?? [];
  const attendus = biens.filter((b) => b.expected_rent > 0).length;
  const payes = biens.filter((b) => b.expected_rent > 0 && b.month_status === 'paid').length;
  const versesDansLaPeriode = releve.payouts.filter((p) => p.paid_in_period && p.processed_at);
  const dateDuVersement = versesDansLaPeriode.length === 1 ? versesDansLaPeriode[0]?.processed_at : null;
  const nomDuMois = f.date(dateDuMois(annuel ? `${periode}-01` : periode), { month: 'long', timeZone: 'UTC' });
  const penalites = releve.late_fees_outstanding?.amount ?? 0;
  const rectificatif = releve.rectification ?? null;

  return (
    <section aria-labelledby="ventilation-du-releve" data-slot="ventilation" className="rounded-xl border border-border bg-card px-4 py-1.5">
      <h2 id="ventilation-du-releve" className="pt-2 pb-1 text-ui font-medium text-muted-foreground">
        {annuel ? t('titreAnnee', { annee: periode }) : t('titre', { mois: nomDuMois })}
      </h2>
      <dl className="divide-y divide-border">
        <Ligne
          libelle={!annuel && attendus > 0 ? t('encaisseLoyers', { payes, attendus }) : t('encaisse')}
          valeur={totaux.gross === 0 ? m(0) : `+ ${m(totaux.gross)}`}
        />
        <Ligne
          libelle={taux !== null ? t('commissionTaux', { taux: f.nombre(taux, { maximumFractionDigits: 2 }) }) : t('commission')}
          valeur={retenu(totaux.commission)}
        />
        <Ligne libelle={t('interventions')} valeur={retenu(totaux.fees)} />
        <Ligne libelle={annuel ? t('netAnnee') : t('net')} valeur={m(totaux.net)} fort />
        <Ligne libelle={dateDuVersement ? t('dejaVerseLe', { date: f.jourMois(dateDuVersement) }) : t('dejaVerse')} valeur={retenu(totaux.paid_out)} />
        {/* P206.03 (ADR-0057, amendement du 2026-10-24) — à part de l'impayé, qui ne les compte pas. */}
        {penalites > 0 ? <Ligne libelle={t('penalites')} valeur={m(penalites)} /> : null}
      </dl>
      {/* TCK-2321 (P177.05) — un mois envoyé se lit tel qu'il a été envoyé ; ce qui a été écrit depuis
          vient à part, en rectificatif, tel que l'API le sert. */}
      {releve.snapshot ? (
        <p className="border-t border-border py-2 text-ui text-muted-foreground">{tReleve('sentOn', { date: f.date(releve.snapshot.sent_at, DATE_COURTE) })}</p>
      ) : null}
      {rectificatif ? (
        <div role="status" className="mb-2 space-y-2 rounded-lg border border-border bg-muted p-3 text-sm">
          <p className="font-medium text-foreground">{tReleve('rectificationTitle', { date: f.date(rectificatif.as_of, DATE_COURTE) })}</p>
          <p className="text-ui text-muted-foreground">{tReleve('rectificationIntro')}</p>
          <dl className="grid grid-cols-2 gap-3">
            {TOTAUX_DU_RECTIFICATIF.filter(([cle]) => (rectificatif.delta[cle] ?? 0) !== 0).map(([cle, libelle]) => {
              const ecart = rectificatif.delta[cle] ?? 0;
              return (
                <div key={cle}>
                  <dt className="text-ui text-muted-foreground">{tReleve(libelle)}</dt>
                  <dd className="tabular-nums text-foreground">{`${ecart > 0 ? '+' : '−'} ${m(Math.abs(ecart))}`}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

/* ──────────────────────────────────────────── Documents ──────────────────────────────────────────── */

export function DocumentsDuReleve({
  periode,
  telechargement,
  className,
}: {
  readonly periode: string;
  readonly telechargement: TelechargementDuReleve;
  readonly className?: string;
}) {
  const t = useTranslations('payments.bailleur.documents');
  const f = useFormatteurs();
  const annuel = estAnnee(periode);
  const annee = periode.slice(0, 4);
  const libelleDuReleve = annuel ? t('releveAnnee', { annee }) : t('releveDe', { mois: f.date(dateDuMois(periode), { month: 'long', timeZone: 'UTC' }) });
  const documents = [
    { cle: 'releve', libelle: libelleDuReleve, period: periode },
    ...(annuel ? [] : [{ cle: 'attestation', libelle: t('attestation', { annee }), period: annee }]),
  ];

  return (
    <section aria-label={t('titre')} data-slot="documents-du-releve" className={cn('rounded-xl border border-border bg-card', className)}>
      <ul className="divide-y divide-border">
        {documents.map((doc) => (
          <li key={doc.cle} className="flex items-center gap-2.5 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-corps leading-snug font-medium text-foreground">{doc.libelle}</span>
            {(['pdf', 'csv'] as const).map((format) => (
              <button
                key={format}
                type="button"
                disabled={telechargement.enCours !== null}
                onClick={() => telechargement.telecharger(doc.period, format)}
                aria-label={t('telecharger', { document: doc.libelle, format: format.toUpperCase() })}
                className="inline-flex h-11 flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-ui font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
              >
                {format === 'pdf' ? (
                  <FileText className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <FileSpreadsheet className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                )}
                {format.toUpperCase()}
              </button>
            ))}
          </li>
        ))}
      </ul>
      {telechargement.erreur ? (
        <p role="alert" className="border-t border-border px-4 py-2 text-ui text-destructive">
          {telechargement.erreur}
        </p>
      ) : null}
    </section>
  );
}

/* ──────────────────────────────────────────── Par bien ──────────────────────────────────────────── */

function etatDuMois(bien: OwnerStatementProperty): { readonly teinte: StatusTone; readonly cle: string; readonly jours?: number } {
  switch (bien.month_status) {
    case 'paid':
      return { teinte: 'success', cle: 'paid' };
    case 'late':
      return bien.days_late !== null ? { teinte: 'attention', cle: 'late', jours: bien.days_late } : { teinte: 'attention', cle: 'lateSansJours' };
    case 'partial':
    case 'due':
    case 'none':
    case 'vacant':
      return { teinte: 'neutral', cle: bien.month_status };
    default:
      return { teinte: 'neutral', cle: 'none' };
  }
}

function EtatDuMois({ bien }: { readonly bien: OwnerStatementProperty }) {
  const t = useTranslations('payments.bailleur.parBien.statuts');
  const etat = etatDuMois(bien);
  const icone =
    etat.teinte === 'success' ? <Check className="size-3" aria-hidden="true" /> : etat.teinte === 'attention' ? <Clock className="size-3" aria-hidden="true" /> : undefined;
  // La pastille passe à la ligne (« Échéance non émise ») plutôt que d'élargir la table « Par bien » hors de sa
  // carte à 1280 : les montants, eux, restent d'un tenant (U+00A0).
  return (
    <StatusBadge
      tone={etat.teinte}
      icon={icone}
      label={etat.jours !== undefined ? t(etat.cle, { jours: etat.jours }) : t(etat.cle)}
      className="whitespace-normal text-left leading-tight portee-app:h-auto portee-app:min-h-6"
    />
  );
}

function VignetteDuBien({ className }: { readonly className?: string }) {
  return (
    <span className={cn('inline-flex flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground', className)} aria-hidden="true">
      <House className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function ParBien({ releve, periode }: { readonly releve: OwnerStatement; readonly periode: string }) {
  const t = useTranslations('payments.bailleur.parBien');
  const f = useFormatteurs();
  const annuel = estAnnee(periode);
  const biens = releve.properties ?? [];
  const m = (valeur: number) => f.montantCourt(valeur, releve.currency);
  const nomDuMois = annuel ? periode : f.date(dateDuMois(periode), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const colonneDuMois = annuel ? periode : f.date(dateDuMois(periode), { month: 'long', timeZone: 'UTC' });
  const majuscule = (texte: string) => texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1);
  const payes = biens.filter((b) => b.month_status === 'paid').length;
  const enRetard = biens.filter((b) => b.month_status === 'late').length;
  const titre = (bien: OwnerStatementProperty) => bien.title ?? t('bienSansTitre');
  const locataire = (bien: OwnerStatementProperty) => bien.tenant_name ?? t('sansLocataire');

  return (
    <section aria-labelledby="par-bien" data-slot="par-bien">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="par-bien" className="font-display text-lg font-semibold tracking-titre text-foreground">
          <span className="lg:hidden">{t('titre')}</span>
          <span className="hidden lg:inline">{t('titreMois', { mois: nomDuMois })}</span>
        </h2>
        <Link href="/app/leases" className="hidden flex-none text-sm font-medium text-primary-deep hover:underline lg:inline">
          {t('voirLesBaux')}
        </Link>
      </div>
      {biens.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <>
          {/* Téléphone : une carte, une ligne par bien. */}
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card lg:hidden" data-slot="par-bien-liste">
            {biens.map((bien) => (
              <li key={bien.property_id} className="flex items-center gap-3 px-4 py-3" data-slot="ligne-du-bien">
                <VignetteDuBien className="size-12" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-corps font-semibold text-foreground">{titre(bien)}</span>
                  <span className="block truncate text-ui text-muted-foreground">{locataire(bien)}</span>
                  <span className="mt-1.5 block">
                    <EtatDuMois bien={bien} />
                  </span>
                </span>
                <span className="flex-none self-start pt-0.5 text-corps font-semibold tabular-nums text-foreground">{m(bien.expected_rent)}</span>
              </li>
            ))}
          </ul>
          {/* Bureau : le tableau. Les colonnes de TEXTE (bien, locataire) se rétrécissent (`max-w-0`, deux lignes
              au plus, texte entier en `title` et dans le DOM pour les lecteurs d'écran) ; les montants gardent leur
              largeur, d'un tenant. Aucun titre ni nom, si long soit-il, n'élargit donc la table hors de sa carte ;
              `overflow-x-auto` ne reste qu'un filet sous 1280. */}
          <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border bg-card lg:block" data-slot="par-bien-tableau">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('titreMois', { mois: nomDuMois })}</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="w-[30%] px-4 py-2.5 font-medium">{t('bien')}</th>
                  <th scope="col" className="w-[20%] px-3 py-2.5 font-medium">{t('locataire')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('loyer')}</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">{majuscule(colonneDuMois)}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('net')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {biens.map((bien) => (
                  <tr key={bien.property_id}>
                    <td className="max-w-0 px-4 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <VignetteDuBien className="size-10" />
                        <span className="line-clamp-2 min-w-0 font-semibold leading-tight [overflow-wrap:anywhere] text-foreground" title={titre(bien)}>
                          {titre(bien)}
                        </span>
                      </span>
                    </td>
                    <td className="max-w-0 px-3 py-3 text-foreground">
                      <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]" title={locataire(bien)}>
                        {locataire(bien)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-foreground">{m(bien.expected_rent)}</td>
                    <td className="px-3 py-3">
                      <EtatDuMois bien={bien} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap text-foreground">
                      {bien.has_movements ? m(bien.net) : <span className="font-normal text-muted-foreground">{t('enAttente')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted font-semibold text-foreground">
                  <td className="px-4 py-3" colSpan={2}>
                    {annuel ? t('totalAnnee') : t('total')}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{m(biens.reduce((s, b) => s + b.expected_rent, 0))}</td>
                  <td className="px-3 py-3 text-xs font-normal text-muted-foreground">{t('resume', { payes, retard: enRetard })}</td>
                  {/* Le net de la période, tel que l'API le rend (reprises comprises), pas une somme de lignes. */}
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{m(releve.totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* ─────────────────────────────────────── Toutes les opérations ─────────────────────────────────────── */

function LienDesOperations({ periode, bailleurId, className }: { readonly periode: string; readonly bailleurId: number | null; readonly className?: string }) {
  const t = useTranslations('payments.bailleur.operations');
  const f = useFormatteurs();
  const annee = periode.slice(0, 4);
  // Le compte de l'année, par la règle même du registre (une page d'une ligne, `meta.total`).
  const lecture = usePaymentsHistory({
    page: 1,
    per_page: 1,
    date_from: `${annee}-01-01`,
    date_to: `${annee}-12-31`,
    landlord_id: bailleurId ?? undefined,
    enabled: bailleurId !== null,
  });
  const total = lecture.isError ? undefined : lecture.data?.meta?.total;

  return (
    <Link
      href="?tab=operations"
      className={cn(
        'flex h-12 items-center rounded-xl border border-border bg-card px-4 text-corps font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{t('toutes')}</span>
      {typeof total === 'number' ? <span className="text-sm text-muted-foreground">{t('compte', { n: total, nombre: f.nombre(total), annee })}</span> : null}
      <ChevronRight className="ml-1 size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/* ─────────────────────────────────────── Derniers versements ─────────────────────────────────────── */

function DerniersVersements({ className }: { readonly className?: string }) {
  const t = useTranslations('payments.bailleur.versements');
  const tStatut = useTranslations('payments.payoutStatus');
  const tMoyens = useTranslations('payments.methods');
  const f = useFormatteurs();
  const lecture = usePayouts({ page: 1, per_page: 3 });
  const versements = lecture.data?.data ?? [];

  return (
    <section aria-labelledby="derniers-versements" data-slot="derniers-versements" className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="derniers-versements" className="font-display text-lg font-semibold tracking-titre text-foreground">
          {t('derniers')}
        </h2>
        <Link href="?tab=versements" className="flex-none text-sm font-medium text-primary-deep hover:underline">
          {t('tous')}
        </Link>
      </div>
      {lecture.isLoading ? (
        <Skeleton className="mt-3 h-24 rounded-xl" />
      ) : versements.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {versements.map((v) => {
            const quand = v.processed_at ?? v.scheduled_at ?? v.created_at;
            const moyen = v.payment_method ? (tMoyens.has(v.payment_method) ? tMoyens(v.payment_method) : v.payment_method.replace(/_/g, ' ')) : null;
            const detail = [moyen, v.reference_number].filter(Boolean).join(' · ');
            return (
              <li key={v.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="w-16 flex-none text-muted-foreground">{quand ? f.jourMois(quand) : '—'}</span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block font-medium text-foreground">
                    {v.period_start ? t('versementDe', { mois: f.date(v.period_start, { month: 'long', timeZone: 'UTC' }) }) : t('versement')}
                  </span>
                  {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
                </span>
                <StatusBadge tone={PAYOUT_STATUS_TONE[v.status as PayoutStatus] ?? 'neutral'} label={tStatut(v.status)} />
                <span className="w-28 flex-none text-right font-semibold tabular-nums text-foreground">{f.montantCourt(v.net_amount, v.currency ?? 'XOF')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
