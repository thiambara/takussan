'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initialesDuNom } from '@/components/admin/finances/argent/encaissement';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { CommissionEntry, CommissionEntryStatus, MoyenDeCommission } from '@/lib/queries/commissions';
import { cn } from '@/lib/utils';

/**
 * TCK-2662 — les pièces des commissions (maquette `app-commissions`, approche A) : la lecture d'une
 * ligne (le bien en titre, jamais la référence du bail ; la part en clair ; le rôle ; la date du
 * paiement ou le motif de l'annulation), la pastille de statut, la carte du téléphone, la carte
 * « On vous doit ».
 */

const TONS: Record<CommissionEntryStatus, StatusTone> = { due: 'attention', paid: 'success', cancelled: 'neutral' };

export const MOYENS_PROPOSES: readonly MoyenDeCommission[] = ['wave', 'orange_money', 'cash', 'bank_transfer'];

/** La lecture d'une ligne, liée à la locale : chaque texte d'une carte ou d'une cellule. */
export function useLectureDeCommission() {
  const t = useTranslations('commissions');
  const f = useFormatteurs();
  const montant = (e: CommissionEntry, valeur = e.amount) => f.montantCourt(valeur, e.currency || 'XOF');
  const moyen = (code: string | null | undefined): string | null => {
    if (!code) return null;
    return t.has(`moyens.${code}`) ? t(`moyens.${code}` as 'moyens.wave') : code.replace(/_/g, ' ');
  };
  const motif = (e: CommissionEntry, court = false): string | null => {
    const code = e.cancel_reason_code;
    if (code === 'other' && e.cancel_reason) return e.cancel_reason;
    if (!code) return e.cancel_reason ?? null;
    return t(`${court ? 'motifsCourts' : 'motifs'}.${code}`);
  };
  const minuscule = (texte: string) => texte.charAt(0).toLocaleLowerCase(f.locale) + texte.slice(1);
  return {
    montant,
    moyen,
    motif,
    /** « Appartement 3 ch. · Mermoz » ; sans bien lisible, un repli — jamais `LS-…` (AC2). */
    bien: (e: CommissionEntry) => {
      const p = e.lease?.property;
      const titre = p?.title?.trim();
      if (!titre) return t('ligne.sansBien');
      const quartier = p?.quarter?.trim();
      // Un titre qui nomme déjà son quartier (« Villa … – Hann Maristes 1 ») ne le répète pas.
      const dejaDit = quartier ? titre.toLocaleLowerCase(f.locale).includes(quartier.toLocaleLowerCase(f.locale)) : true;
      return dejaDit ? titre : `${titre} · ${quartier}`;
    },
    titreDuBien: (e: CommissionEntry) => e.lease?.property?.title?.trim() || t('ligne.sansBien'),
    quartier: (e: CommissionEntry) => e.lease?.property?.quarter?.trim() || null,
    /** « 40 % de 725 000 F ». */
    part: (e: CommissionEntry) => t('shareOf', { percent: f.pourcentage(e.share_percent / 100, { maximumFractionDigits: 2 }), base: montant(e, e.base_amount) }),
    taux: (e: CommissionEntry) => f.pourcentage(e.share_percent / 100, { maximumFractionDigits: 2 }),
    role: (e: CommissionEntry) => t(`roles.${e.origin}`),
    Role: (e: CommissionEntry) => t(`origins.${e.origin}`),
    jour: (instant: string | null) => f.jourMois(instant),
    /** La fin de la ligne de détail : le rôle et la naissance ; le paiement ; l'annulation et son motif. */
    detail: (e: CommissionEntry): string => {
      if (e.status === 'paid') {
        return [t('ligne.payeeLe', { date: f.jourMois(e.paid_at) }), moyen(e.payment_method)].filter(Boolean).join(' · ');
      }
      if (e.status === 'cancelled') {
        const m = motif(e);
        return [t('ligne.annulee'), m].filter(Boolean).join(' · ');
      }
      return [t(`roles.${e.origin}`), f.jourMois(e.earned_at)].join(' · ');
    },
    minuscule,
  };
}

export type LectureDeCommission = ReturnType<typeof useLectureDeCommission>;

/** La pastille : « Due » (ocre), « ✓ Payée » (vert), « Annulée » (neutre). */
export function StatutDeCommission({ statut }: { readonly statut: CommissionEntryStatus }) {
  const t = useTranslations('commissions');
  return (
    <StatusBadge
      tone={TONS[statut]}
      label={t(`status.${statut}`)}
      icon={statut === 'paid' ? <Check className="size-3" strokeWidth={2.5} aria-hidden="true" /> : undefined}
    />
  );
}

export function AvatarDeBeneficiaire({ nom, taille = '40' }: { readonly nom: string; readonly taille?: '28' | '32' | '40' }) {
  return (
    <Avatar size={taille} aria-hidden="true">
      <AvatarFallback>{initialesDuNom(nom)}</AvatarFallback>
    </Avatar>
  );
}

/** Le bien d'une ligne, lien vers son bail : on garde le chemin du bail, sans changer l'aspect. */
export function LienDuBail({ e, children, className }: { readonly e: CommissionEntry; readonly children: ReactNode; readonly className?: string }) {
  return (
    <Link
      href={`/app/leases/${e.lease_id}`}
      className={cn('rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring', className)}
    >
      {children}
    </Link>
  );
}

/**
 * Une commission au téléphone : le montant d'abord (22 px), la pastille, le menu ; le bien en
 * titre ; la part en clair et la fin de ligne (`detail`).
 */
export function CarteDeCommission({ e, menu }: { readonly e: CommissionEntry; readonly menu?: ReactNode }) {
  const l = useLectureDeCommission();
  const annulee = e.status === 'cancelled';
  return (
    <div data-slot="carte-commission" className="px-4 py-3.5">
      <div className="flex items-center gap-2">
        <p
          className={cn(
            'min-w-0 flex-1 font-display text-affiche-22 font-semibold leading-none tracking-titre tabular-nums',
            annulee && 'text-muted-foreground line-through decoration-1',
          )}
        >
          {l.montant(e)}
        </p>
        <StatutDeCommission statut={e.status} />
        {menu}
      </div>
      <p className="mt-2 truncate text-corps font-semibold leading-tight">
        <LienDuBail e={e}>{l.bien(e)}</LienDuBail>
      </p>
      <p className="mt-1 truncate text-ui text-muted-foreground">
        {l.part(e)} · {l.detail(e)}
      </p>
    </div>
  );
}

/** « On vous doit » : le chiffre que l'agent vient chercher. */
export function CarteDuDu({
  montant,
  baux,
  plusAncienne,
  children,
}: {
  readonly montant: number;
  readonly baux: number;
  readonly plusAncienne: string | null;
  readonly children?: ReactNode;
}) {
  const t = useTranslations('commissions.agent');
  const f = useFormatteurs();
  return (
    <div data-slot="carte-du" className="rounded-xl border border-primary/15 bg-secondary p-5">
      <p className="text-sm font-medium text-primary-deep">{t('onVousDoit')}</p>
      <p className="mt-1.5 font-display text-4xl leading-normal font-semibold tracking-titre tabular-nums">
        {f.nombre(montant)} <span className="text-lg leading-normal font-medium tracking-normal text-encre-douce">{t('devise')}</span>
      </p>
      <p className="mt-3 text-sm text-encre-douce">
        {[t('baux', { count: baux }), plusAncienne ? t('plusAncienne', { date: f.jourMois(plusAncienne) }) : null].filter(Boolean).join(' · ')}
      </p>
      {children}
    </div>
  );
}

/** La bascule « Par agent / Par ligne » : deux boutons enfoncés (`aria-pressed`). */
export function Bascule<T extends string>({
  options,
  actif,
  onChange,
  libelle,
  pleine,
  className,
}: {
  readonly options: readonly { readonly valeur: T; readonly libelle: string }[];
  readonly actif: T;
  readonly onChange: (valeur: T) => void;
  readonly libelle: string;
  readonly pleine?: boolean;
  readonly className?: string;
}) {
  return (
    <div role="group" aria-label={libelle} className={cn('inline-flex h-9 items-center rounded-lg bg-muted p-0.5', pleine && 'flex h-10 w-full', className)}>
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          aria-pressed={o.valeur === actif}
          onClick={() => onChange(o.valeur)}
          className={cn(
            'inline-flex h-full items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
            pleine && 'flex-1',
            o.valeur === actif ? 'bg-card text-foreground shadow-actif' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}
