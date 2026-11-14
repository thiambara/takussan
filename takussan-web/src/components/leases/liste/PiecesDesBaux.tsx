'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initiales } from '@/lib/fiche-publique';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { BailDeLaListe, ElementDEntree, EntreeDAttention } from '@/lib/queries/leases-file';
import { cn } from '@/lib/utils';
import type { LeaseStatus } from '@/types/lease';

import { GesteDuBail } from './GesteDuBail';
import { TON_DU_MOTIF, type LectureDuBail, type TonDuMotif } from './lecture';

/**
 * TCK-2644 — les pièces de la liste des baux (maquette `app-baux`, approche a) : la carte de la file
 * au téléphone (`CarteAttente`), la ligne d'un bail hors de la file, les rangées du tableau du bureau.
 */

/** Le seuil de l'ancien écran des entrées en attente (TCK-266) : au-delà, la pastille passe au rouge. */
export const JOURS_D_ENTREE_EN_ALERTE = 14;

const TON_DU_STATUT: Readonly<Record<LeaseStatus, 'neutral' | 'success' | 'attention' | 'info'>> = {
  draft: 'neutral',
  pending_signature: 'attention',
  active: 'success',
  terminating: 'attention',
  expired: 'neutral',
  terminated: 'neutral',
  renewed: 'info',
};

export function PointTon({ ton, className }: { readonly ton: TonDuMotif; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 flex-none rounded-full', ton === 'danger' ? 'bg-destructive' : ton === 'attention' ? 'bg-warning' : 'bg-accent', className)}
    />
  );
}

export function StatutDuBail({ statut }: { readonly statut: LeaseStatus }) {
  const t = useTranslations('lease.status');
  return <StatusBadge label={t(statut)} tone={TON_DU_STATUT[statut]} />;
}

/** Le loyer par mois, ou le prix d'une vente ; rien sans montant. */
export function LoyerDuBail({
  bail,
  className,
  sansPeriode = false,
}: {
  readonly bail: BailDeLaListe;
  readonly className?: string;
  /** La file « À traiter » écrit le montant seul, comme la maquette ; un prix de vente se dit toujours. */
  readonly sansPeriode?: boolean;
}) {
  const t = useTranslations('lease.liste');
  const f = useFormatteurs();
  const vente = bail.type === 'sale';
  const montant = vente ? bail.sale_price : bail.monthly_rent;
  if (typeof montant !== 'number') return null;
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {f.montantCourt(montant, bail.currency)}
      {vente || !sansPeriode ? <span className="font-normal text-muted-foreground"> {vente ? t('prixDeVente') : t('parMois')}</span> : null}
    </span>
  );
}

// L'aplat accent de la maquette n'est pas repris : l'accent est réservé aux badges *featured*, et
// `accent/15` tombe sous 4,5:1 (docs/design-guidelines.md). Le repli par défaut de l'avatar suffit.
function InitialesDeLAgent({ nom }: { readonly nom: string }) {
  return (
    <Avatar size="28" aria-hidden="true">
      <AvatarFallback>{initiales(nom)}</AvatarFallback>
    </Avatar>
  );
}

function InitialesDuLocataire({ nom }: { readonly nom: string }) {
  return (
    <Avatar size="40" aria-hidden="true">
      <AvatarFallback>{initiales(nom)}</AvatarFallback>
    </Avatar>
  );
}

/** Ce qui attend : le motif principal, ou l'entrée incomplète (onglet « En attente du locataire »). */
export interface Attente {
  readonly entree: EntreeDAttention;
  readonly manquants?: readonly ElementDEntree[];
}

/** L'âge d'une entrée en attente passe au rouge au-delà de 14 jours (la pastille de TCK-266). */
function enAlerte(entree: EntreeDAttention, maintenant: Date): boolean {
  if (entree.motif !== 'onboarding_incomplete') return false;
  return (maintenant.getTime() - Date.parse(`${entree.since.slice(0, 10)}T00:00:00Z`)) / 86_400_000 > JOURS_D_ENTREE_EN_ALERTE;
}

/** La ligne « Il reste : … · Signé le … » d'une entrée en attente (rien ne se perd de TCK-266). */
function DetailDeLEntree({ bail, manquants }: { readonly bail: BailDeLaListe; readonly manquants?: readonly ElementDEntree[] }) {
  const t = useTranslations('lease.liste');
  const f = useFormatteurs();
  const parts = [
    manquants && manquants.length > 0 ? t('ilReste', { elements: manquants.map((m) => t(`elements.${m}`)).join(' · ') }) : null,
    bail.signed_at ? t('signeLe', { date: f.date(bail.signed_at, { day: 'numeric', month: 'short', year: 'numeric' }) }) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="block text-xs text-muted-foreground">{parts.join(' · ')}</span>;
}

/** Une carte de la file (téléphone) : qui, quel bien, ce qui attend avec son âge, UN geste. */
export function CarteDAttente({
  bail,
  attente,
  lecture,
  maintenant,
}: {
  readonly bail: BailDeLaListe;
  readonly attente: Attente;
  readonly lecture: LectureDuBail;
  readonly maintenant: Date;
}) {
  const { entree, manquants } = attente;
  const ton = TON_DU_MOTIF[entree.motif];
  const nom = lecture.locataire(bail);
  return (
    <li data-slot="carte-d-attente" className="rounded-xl border border-border bg-card p-4">
      <div className="relative flex items-start gap-3">
        <InitialesDuLocataire nom={nom} />
        <div className="min-w-0 flex-1 leading-snug">
          <Link
            href={`/app/leases/${bail.id}`}
            className="block truncate text-corps font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {nom}
          </Link>
          <p className="truncate text-ui text-muted-foreground">{lecture.bien(bail)}</p>
        </div>
        <ChevronRight className="mt-1 size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-3 flex items-baseline gap-2 text-sm">
        <PointTon ton={ton} className="-translate-y-px" />
        <span className={cn('min-w-0 flex-1 font-medium', ton === 'danger' && 'text-destructive')}>{lecture.quoi(bail, entree, manquants?.length)}</span>
        <span className={cn('flex-none text-ui text-muted-foreground', enAlerte(entree, maintenant) && 'font-medium text-destructive')}>{lecture.age(bail, entree)}</span>
      </p>
      {entree.motif === 'onboarding_incomplete' ? (
        <div className="mt-1 pl-4">
          <DetailDeLEntree bail={bail} manquants={manquants} />
        </div>
      ) : null}
      <div className="mt-3">
        <GesteDuBail bail={bail} entree={entree} lecture={lecture} manquants={manquants} forme="carte" />
      </div>
    </li>
  );
}

/** Un bail hors de la file (téléphone) : la référence, le statut, le bien, les dates, le loyer. */
export function LigneDuBail({ bail, lecture }: { readonly bail: BailDeLaListe; readonly lecture: LectureDuBail }) {
  const t = useTranslations('lease.liste');
  const f = useFormatteurs();
  const nom = lecture.locataire(bail);
  return (
    <li data-slot="ligne-de-bail" className="relative flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <InitialesDuLocataire nom={nom} />
      <div className="min-w-0 flex-1 leading-snug">
        <div className="flex items-center gap-2">
          <Link
            href={`/app/leases/${bail.id}`}
            className="min-w-0 flex-1 truncate text-corps font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {nom}
          </Link>
          <StatutDuBail statut={bail.status} />
        </div>
        <p className="truncate text-ui text-muted-foreground">{lecture.bien(bail)}</p>
        <p className="mt-1 flex items-baseline gap-2 text-ui">
          <span className="min-w-0 flex-1 truncate tabular-nums text-muted-foreground">
            {lecture.reference(bail)} · {f.date(bail.start_date, { day: 'numeric', month: 'short', year: 'numeric' })} →{' '}
            {bail.end_date ? f.date(bail.end_date, { day: 'numeric', month: 'short', year: 'numeric' }) : t('sansFin')}
          </span>
          <LoyerDuBail bail={bail} className="flex-none font-medium" />
        </p>
      </div>
    </li>
  );
}

export function Th({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return (
    <th scope="col" className={cn('h-10 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground', className)}>
      {children}
    </th>
  );
}

/** La cellule « Locataire » : le nom (lien vers la fiche) et la référence. */
function CelluleLocataire({ bail, lecture }: { readonly bail: BailDeLaListe; readonly lecture: LectureDuBail }) {
  return (
    <span className="block max-w-[calc(var(--spacing)*52.78)] leading-tight">
      <Link href={`/app/leases/${bail.id}`} className="block truncate font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
        {lecture.locataire(bail)}
      </Link>
      <span className="block text-xs tabular-nums text-muted-foreground">{lecture.reference(bail)}</span>
    </span>
  );
}

function CelluleAgent({ bail }: { readonly bail: BailDeLaListe }) {
  const nom = bail.agent?.full_name?.trim();
  return nom ? (
    <span title={nom} className="inline-flex">
      <InitialesDeLAgent nom={nom} />
      <span className="sr-only">{nom}</span>
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

/** Le tableau de la file (bureau) : Locataire · Bien · Ce qui attend · Loyer · Fin · Agent · Action. */
export function TableDAttente({
  lignes,
  lecture,
  maintenant,
}: {
  readonly lignes: readonly { readonly bail: BailDeLaListe; readonly attente: Attente | null }[];
  readonly lecture: LectureDuBail;
  readonly maintenant: Date;
}) {
  const t = useTranslations('lease.liste');
  const f = useFormatteurs();
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{t('caption')}</caption>
      <thead className="border-b border-border bg-muted/40">
        <tr>
          <Th className="pl-4">{t('colonnes.locataire')}</Th>
          <Th>{t('colonnes.bien')}</Th>
          <Th>{t('colonnes.ceQuiAttend')}</Th>
          <Th className="text-right">{t('colonnes.loyer')}</Th>
          <Th>{t('colonnes.fin')}</Th>
          <Th>{t('colonnes.agent')}</Th>
          <Th className="pr-4 text-right">{t('colonnes.action')}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {lignes.map(({ bail, attente }) => {
          const ton = attente ? TON_DU_MOTIF[attente.entree.motif] : null;
          return (
            <tr key={bail.id} data-slot="rangee-d-attente" className="hover:bg-secondary/50 focus-within:bg-secondary/50">
              <td className="h-14 pr-3 pl-4">
                <CelluleLocataire bail={bail} lecture={lecture} />
              </td>
              <td className="h-14 max-w-50 truncate px-3 text-encre-douce">{lecture.bien(bail)}</td>
              <td className="h-14 px-3">
                {attente && ton ? (
                  <span className="flex items-center gap-2">
                    <PointTon ton={ton} />
                    <span className="leading-tight">
                      <span className={cn('block font-medium', ton === 'danger' && 'text-destructive')}>{lecture.quoi(bail, attente.entree, attente.manquants?.length, true)}</span>
                      <span className={cn('block text-xs whitespace-nowrap text-muted-foreground', enAlerte(attente.entree, maintenant) && 'font-medium text-destructive')}>
                        {lecture.age(bail, attente.entree)}
                      </span>
                      {attente.entree.motif === 'onboarding_incomplete' ? <DetailDeLEntree bail={bail} manquants={attente.manquants} /> : null}
                    </span>
                  </span>
                ) : null}
              </td>
              <td className="px-3 text-right">
                <LoyerDuBail bail={bail} sansPeriode />
              </td>
              <td className="px-3 whitespace-nowrap tabular-nums text-encre-douce">
                {bail.end_date ? f.date(bail.end_date, { day: 'numeric', month: 'short', year: 'numeric' }) : t('sansFin')}
              </td>
              <td className="px-3">
                <CelluleAgent bail={bail} />
              </td>
              <td className="h-14 pr-4 text-right">
                {attente ? <GesteDuBail bail={bail} entree={attente.entree} lecture={lecture} manquants={attente.manquants} forme="rangee" /> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Le tableau hors de la file (bureau) : Locataire · Bien · Statut · Loyer · Début · Fin · Agent. */
export function TableDesBaux({ baux, lecture }: { readonly baux: readonly BailDeLaListe[]; readonly lecture: LectureDuBail }) {
  const t = useTranslations('lease.liste');
  const f = useFormatteurs();
  const date = (d: string) => f.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{t('caption')}</caption>
      <thead className="border-b border-border bg-muted/40">
        <tr>
          <Th className="pl-4">{t('colonnes.locataire')}</Th>
          <Th>{t('colonnes.bien')}</Th>
          <Th>{t('colonnes.statut')}</Th>
          <Th className="text-right">{t('colonnes.loyer')}</Th>
          <Th>{t('colonnes.debut')}</Th>
          <Th>{t('colonnes.fin')}</Th>
          <Th>{t('colonnes.agent')}</Th>
          <Th className="w-10 pr-4" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {baux.map((bail) => (
          <tr key={bail.id} data-slot="rangee-de-bail" className="hover:bg-secondary/50 focus-within:bg-secondary/50">
            <td className="py-3 pr-3 pl-4">
              <CelluleLocataire bail={bail} lecture={lecture} />
            </td>
            <td className="max-w-44 truncate px-3 text-encre-douce">{lecture.bien(bail)}</td>
            <td className="px-3">
              <StatutDuBail statut={bail.status} />
            </td>
            <td className="px-3 text-right">
              <LoyerDuBail bail={bail} />
            </td>
            <td className="px-3 whitespace-nowrap tabular-nums text-encre-douce">{date(bail.start_date)}</td>
            <td className="px-3 whitespace-nowrap tabular-nums text-encre-douce">{bail.end_date ? date(bail.end_date) : t('sansFin')}</td>
            <td className="px-3">
              <CelluleAgent bail={bail} />
            </td>
            <td className="pr-4 text-right">
              <ChevronRight className="inline size-4 text-muted-foreground" aria-hidden="true" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
