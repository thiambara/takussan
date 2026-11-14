'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, MessageSquare, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref } from '@/components/crm/contact';
import { useTelechargementApi } from '@/hooks/useTelechargementApi';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { usePaymentsHistory, useResumeDuLoyer } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { TitreBloc } from '../pieces';

/**
 * TCK-2625 (maquette `app-accueil` a, écran « Locataire ») — « Mon logement » : le bien loué et
 * l'agence qui le gère, puis les trois gestes du locataire :
 *
 *  - « Signaler un problème » → le signalement (TCK-2654) ;
 *  - « Dernière quittance » → le PDF de la dernière échéance de loyer ou de charges payée
 *    (`GET leases/{lease}/receipts/{payment}/pdf`, le téléchargement authentifié de l'historique) ;
 *    sans quittance, pas de geste ; ses messages sont ceux d'une quittance (`telechargement.*`), pas
 *    l'espace `documents` entier, que l'accueil ne sert pas ;
 *  - « Contacter l'agence » → son téléphone, quand il est joignable.
 *
 * Le bail et l'agence viennent du résumé du loyer (`/api/me/rent-summary`, déjà lu par la carte) ;
 * la quittance, de l'historique filtré par l'API sur les paiements réglés (dix lignes : la première
 * de loyer ou de charges — l'API n'a pas de filtre par nature).
 *
 * Écarts de donnée à la maquette : la photo du bien, la fin du bail et l'agent (non servis).
 */
/**
 * Dix lignes réglées, pas trois : trois pénalités récentes masqueraient la quittance (décision du lead,
 * 2026-11-13). Sans ligne de loyer ou de charges parmi elles, pas de geste.
 */
const QUITTANCES_LUES = 10;

export function MonLogement({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.locataire.logement');
  const f = useFormatteurs();
  const resume = useResumeDuLoyer();
  const payes = usePaymentsHistory({ status: 'paid', sort: '-date', per_page: QUITTANCES_LUES });
  const bail = resume.data?.data?.lease ?? null;
  if (!bail) return null;

  const agence = bail.agency;
  const telephone = agence?.phone ?? resume.data?.data?.offline_payment?.agency_phone ?? null;
  const quittance = (payes.data?.data ?? []).find(
    (r) => r.source === 'lease' && r.status === 'paid' && r.lease_id !== null && (r.payment_type === 'rent' || r.payment_type === 'charges'),
  );
  const loyer = bail.monthly_rent != null ? f.montantCourt(bail.monthly_rent, bail.currency ?? resume.data?.data?.currency ?? null) : null;

  return (
    <section aria-labelledby="mon-logement" className={cn('space-y-2', className)} data-slot="mon-logement">
      <TitreBloc id="mon-logement" className="md:px-0">
        {t('titre')}
      </TitreBloc>
      <div className="overflow-hidden rounded-2xl border border-border bg-card max-md:mx-4">
        <div className="px-4 py-3">
          <p className="truncate text-corps font-semibold">{bail.property?.title ?? t('bienSansTitre')}</p>
          {loyer ? <p className="truncate text-ui text-muted-foreground">{t('loyerParMois', { loyer })}</p> : null}
          {agence?.name ? <p className="truncate text-ui text-muted-foreground">{t('gerePar', { agence: agence.name })}</p> : null}
        </div>
        <ul className="divide-y divide-border border-t border-border">
          <li>
            <Raccourci icone={Wrench} titre={t('signaler')} detail={t('signalerDetail')} href="/app/maintenance/new" />
          </li>
          {quittance ? (
            <li>
              <DerniereQuittance row={quittance} />
            </li>
          ) : null}
          {isReachable(telephone) ? (
            <li>
              <Raccourci icone={MessageSquare} titre={t('contacter')} detail={agence?.name ?? telephone} href={telHref(telephone)} />
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

const LIGNE = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring';

function Contenu({ icone: I, titre, detail }: { readonly icone: ComponentType<{ className?: string; strokeWidth?: number }>; readonly titre: string; readonly detail: ReactNode }) {
  return (
    <>
      <I className="size-5 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-corps font-medium">{titre}</span>
        <span className="block truncate text-ui text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
}

function Raccourci({ icone, titre, detail, href }: { readonly icone: ComponentType<{ className?: string; strokeWidth?: number }>; readonly titre: string; readonly detail: ReactNode; readonly href: string }) {
  return (
    <Link href={href} className={LIGNE}>
      <Contenu icone={icone} titre={titre} detail={detail} />
    </Link>
  );
}

function DerniereQuittance({ row }: { readonly row: PaymentHistoryRow }) {
  const t = useTranslations('accueil.locataire.logement');
  const f = useFormatteurs();
  const { telecharger, enCours, echec } = useTelechargementApi();
  const mois = row.period_start ? f.date(row.period_start, { month: 'long', dateStyle: undefined }) : null;
  const detail = [mois ? mois.charAt(0).toUpperCase() + mois.slice(1) : null, row.paid_at ? t('payeLe', { date: f.jourMois(row.paid_at) }) : null].filter(Boolean).join(' · ');
  return (
    <>
      <button
        type="button"
        className={LIGNE}
        disabled={enCours}
        aria-busy={enCours}
        onClick={() => void telecharger(cheminApi`/api/leases/${row.lease_id}/receipts/${row.id}/pdf`, `quittance-${row.reference_number ?? row.id}.pdf`)}
        data-slot="derniere-quittance"
      >
        <Contenu icone={FileText} titre={t('quittance')} detail={enCours ? t('telechargement.enCours') : detail} />
      </button>
      {echec ? (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          {t(`telechargement.${echec}`)}
        </p>
      ) : null}
    </>
  );
}
