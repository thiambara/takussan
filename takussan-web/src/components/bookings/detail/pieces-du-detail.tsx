'use client';

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Banknote, Check, ChevronRight, Phone, UserRound } from 'lucide-react';

import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { buttonVariants } from '@/components/ui/button';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';

import { InitialesDuClient, useNomDuClient, VignetteDuBien } from '../liste/pieces';

/**
 * TCK-2594 — les pièces de la fiche d'une réservation (maquette `app-reservations` a, écrans
 * « Candidature », « Acceptée — créer le bail », « Offre », « Séjour ») : les blocs Qui / Quoi, la
 * comparaison d'une offre, les dates et le montant d'un séjour, la suite d'une candidature acceptée,
 * l'historique. Au téléphone, des sections à intertitre ; au bureau, des cartes titrées.
 */

/** L'intertitre d'une section du téléphone : petites capitales espacées, et un compte facultatif. */
export function SectionDuTelephone({
  titre,
  compte,
  children,
  className,
}: {
  readonly titre: string;
  readonly compte?: number;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn('border-t border-border px-4 py-4', className)}>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-surtitre text-muted-foreground">
        {titre}
        {compte !== undefined ? <span className="tabular-nums">{compte}</span> : null}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Une carte titrée du bureau (`Carte` de la maquette). */
export function CarteDuBureau({ titre, children, className }: { readonly titre: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      <h2 className="truncate border-b border-border px-4 py-3 text-corps font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

/** Une ligne clé → valeur (`LigneCle`), dans une liste de définitions. */
export function LigneCle({ cle, children }: { readonly cle: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="flex-none text-muted-foreground">{cle}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

/** Le message du client, cité. */
export function Citation({ children }: { readonly children: ReactNode }) {
  return <p className="whitespace-pre-line rounded-lg border-l-2 border-primary/40 bg-muted/50 px-3 py-2.5 text-sm leading-snug text-foreground">{children}</p>;
}

/** Le bien concerné : vignette, titre · quartier, ce qu'il affiche, et le lien vers lui. */
export function BienDeLaDemande({
  titre,
  photo,
  affiche,
  lien,
  className,
}: {
  readonly titre: string;
  readonly photo: string | null | undefined;
  readonly affiche: string | null;
  /** `/app/properties/12` au personnel ; la fiche publique (`publique`) aux autres. */
  readonly lien: { readonly href: string; readonly publique: boolean } | null;
  readonly className?: string;
}) {
  const t = useTranslations('bookings.fiche');
  const classeDuLien = 'text-primary hover:underline';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <VignetteDuBien src={photo} className="size-16" />
      <div className="min-w-0 flex-1">
        <p className="text-action leading-snug font-semibold">{titre}</p>
        {affiche ? <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{affiche}</p> : null}
        {lien ? (
          <p className="mt-0.5 text-ui font-medium">
            {lien.publique ? (
              <LienLocalise href={lien.href} className={classeDuLien}>
                {t('voirLeBien')}
              </LienLocalise>
            ) : (
              <Link href={lien.href} className={classeDuLien}>
                {t('voirLeBien')}
              </Link>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const GESTE = cn(buttonVariants({ variant: 'outline' }), 'h-11 gap-1.5 px-2 text-sm font-medium');

/**
 * QUI : la personne, ce qu'on sait d'elle, et comment la joindre. Appeler et WhatsApp seulement sur
 * un numéro joignable (le bailleur reçoit un numéro masqué : ni l'un ni l'autre) ; « Fiche » au
 * seul personnel.
 */
export function BlocQui({
  b,
  ficheHref,
  messageWhatsApp,
  large,
}: {
  readonly b: Booking;
  readonly ficheHref: string | null;
  readonly messageWhatsApp: string;
  readonly large?: boolean;
}) {
  const t = useTranslations('bookings.fiche');
  const nomDuClient = useNomDuClient();
  const nom = nomDuClient(b);
  const numero = b.customer?.phone ?? null;
  const joignable = isReachable(numero);
  const faits = [b.customer?.occupation?.trim() || null, b.visits_on_property ? t('qui.visites', { n: b.visits_on_property }) : null].filter(
    (f): f is string => !!f,
  );
  return (
    <div data-slot="bloc-qui">
      <div className="flex items-center gap-3">
        <InitialesDuClient nom={nom} taille={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-action font-semibold">{nom}</p>
          {numero ? <p className="text-sm tabular-nums text-muted-foreground">{joignable ? formaterTelephone(numero) : numero}</p> : null}
        </div>
      </div>
      {faits.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {faits.map((f) => (
            <li key={f} className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      {joignable || ficheHref ? (
        <div className={cn('mt-3 grid grid-cols-3 gap-2', large && 'max-w-md')}>
          {joignable ? (
            <>
              <a href={telHref(numero)} className={GESTE}>
                <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('qui.appeler')}
              </a>
              <a
                href={whatsappHref(numero, messageWhatsApp)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(GESTE, 'border-transparent bg-success text-success-foreground hover:bg-success/90 hover:text-success-foreground')}
              >
                <IconeWhatsApp className="size-4" />
                {t('qui.whatsapp')}
              </a>
            </>
          ) : null}
          {ficheHref ? (
            <Link href={ficheHref} className={GESTE}>
              <UserRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t('qui.fiche')}
            </Link>
          ) : null}
        </div>
      ) : null}
      {b.visits_on_property ? (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm leading-snug">
          <span className="font-medium">{t('qui.dejaVisite')}</span>{' '}
          <span className="text-muted-foreground">{t('qui.visitesEnregistrees', { n: b.visits_on_property })}</span>
        </p>
      ) : null}
    </div>
  );
}

/** L'offre face au prix affiché : le montant, la jauge, le prix affiché et l'écart. */
export function ComparaisonDeLOffre({
  offre,
  affiche,
  ecartMontant,
  ecartPourcentage,
  part,
  className,
}: {
  readonly offre: string;
  readonly affiche: string | null;
  readonly ecartMontant: string | null;
  readonly ecartPourcentage: string | null;
  /** L'offre rapportée au prix affiché, de 0 à 1 (la jauge) ; `null` sans prix affiché. */
  readonly part: number | null;
  readonly className?: string;
}) {
  const t = useTranslations('bookings.fiche.offre');
  return (
    <div data-slot="comparaison-de-l-offre" className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <p className="text-ui text-muted-foreground">{t('titre')}</p>
      <p className="mt-0.5 font-display text-affiche-28 leading-tight font-semibold tabular-nums tracking-titre">{offre}</p>
      {part !== null ? (
        <div className="mt-3 h-2 rounded-full bg-muted" aria-hidden="true">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, Math.max(0, part)) * 1000) / 10}%` }} />
        </div>
      ) : null}
      {affiche ? (
        <dl className="mt-2 divide-y divide-border text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-muted-foreground">{t('prixAffiche')}</dt>
            <dd className="font-medium">{affiche}</dd>
          </div>
          {ecartMontant && ecartPourcentage ? (
            <div className="flex items-baseline justify-between gap-3 pt-2">
              <dt className="text-muted-foreground">{t('ecart')}</dt>
              <dd className="whitespace-nowrap font-semibold">{t('ecartValeur', { montant: ecartMontant, pourcentage: ecartPourcentage })}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

/** Arrivée et départ d'un séjour, puis ses nuits. */
export function DatesDuSejour({ arrivee, depart, nuits, className }: { readonly arrivee: string; readonly depart: string; readonly nuits: number | null; readonly className?: string }) {
  const t = useTranslations('bookings.fiche.sejour');
  return (
    <div className={className}>
      <dl className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-card">
        <div className="p-3.5">
          <dt className="text-ui text-muted-foreground">{t('arrivee')}</dt>
          <dd className="mt-0.5 text-corps font-semibold">{arrivee}</dd>
        </div>
        <div className="p-3.5">
          <dt className="text-ui text-muted-foreground">{t('depart')}</dt>
          <dd className="mt-0.5 text-corps font-semibold">{depart}</dd>
        </div>
      </dl>
      {nuits !== null ? <p className="mt-2 text-sm text-muted-foreground">{t('nuits', { n: nuits })}</p> : null}
    </div>
  );
}

/** Une jauge d'encaissement : ce qui est reçu sur le total. */
export function JaugeDEncaissement({ part, legende }: { readonly part: number; readonly legende: string }) {
  return (
    <>
      <div className="mt-2 h-2 rounded-full bg-muted" aria-hidden="true">
        <div className="h-2 rounded-full bg-success" style={{ width: `${Math.round(Math.min(1, Math.max(0, part)) * 1000) / 10}%` }} />
      </div>
      <p className="mt-1.5 text-ui tabular-nums text-muted-foreground">{legende}</p>
    </>
  );
}

/** La suite d'une candidature acceptée : le bail, déjà rempli avec ce que la candidature sait. */
export function SuiteDuBail({ lignes, className }: { readonly lignes: readonly { readonly cle: string; readonly valeur: string }[]; readonly className?: string }) {
  const t = useTranslations('bookings.fiche.suiteBail');
  return (
    <div data-slot="suite-du-bail" className={cn('rounded-xl border border-success/30 bg-success/7 p-4', className)}>
      <p className="flex items-center gap-2 text-corps font-semibold">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-success text-success-foreground">
          <Check className="size-4" aria-hidden="true" />
        </span>
        {t('titre')}
      </p>
      <p className="mt-1.5 text-sm leading-snug text-foreground">{t('texte')}</p>
      <dl className="mt-3 divide-y divide-success/20 rounded-lg bg-card px-3">
        {lignes.map((l) => (
          <LigneCle key={l.cle} cle={l.cle}>
            <span className="tabular-nums">{l.valeur}</span>
          </LigneCle>
        ))}
      </dl>
      <p className="mt-2.5 text-ui text-muted-foreground">{t('modifiable')}</p>
    </div>
  );
}

/** Un paiement : sa pastille, sa nature et son montant, son moyen et sa date, sa référence, son geste. */
export function LigneDePaiement({
  paye,
  titre,
  detail,
  reference,
  geste,
}: {
  readonly paye: boolean;
  readonly titre: string;
  readonly detail: string;
  readonly reference: string | null;
  readonly geste: ReactNode;
}) {
  return (
    <li data-slot="ligne-de-paiement" className="flex min-h-15 flex-wrap items-center gap-3 py-2">
      <span
        className={cn(
          'inline-flex size-9 flex-none items-center justify-center rounded-full',
          paye ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {paye ? <Check className="size-icone" /> : <Banknote className="size-icone" strokeWidth={1.75} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium tabular-nums">{titre}</p>
        <p className="text-ui tabular-nums text-muted-foreground">{detail}</p>
        {reference ? <p className="truncate text-ui tabular-nums text-muted-foreground">{reference}</p> : null}
      </div>
      <span className="flex flex-none flex-wrap items-center gap-2">{geste}</span>
    </li>
  );
}

/** Un autre geste du téléphone : une rangée qui ouvre (Rembourser, Annuler). */
export function RangeeDeGeste({
  icone,
  libelle,
  aide,
  danger,
  onClick,
  disabled,
}: {
  readonly icone: ReactNode;
  readonly libelle: string;
  readonly aide?: string;
  readonly danger?: boolean;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  // L'aide décrit le geste, elle ne le nomme pas : le nom accessible reste le libellé seul.
  const idAide = useId();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aide ? libelle : undefined}
      aria-describedby={aide ? idAide : undefined}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 py-1.5 text-left text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50',
        danger && 'text-destructive',
      )}
    >
      {icone}
      <span className="flex-1">
        {libelle}
        {aide ? (
          <span id={idAide} className="block text-ui text-muted-foreground">
            {aide}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** L'historique : qui a fait quoi, quand — du plus récent au plus ancien. */
export function HistoriqueDeLaReservation({ lignes }: { readonly lignes: readonly { readonly quoi: string; readonly quand: string; readonly cle: string }[] }) {
  return (
    <ol className="space-y-3">
      {lignes.map((l, i) => (
        <li key={l.cle} className="flex gap-3 text-sm">
          <span className="mt-1.5 flex flex-none flex-col items-center" aria-hidden="true">
            <span className={cn('size-2 rounded-full', i === 0 ? 'bg-primary' : 'bg-foreground/25')} />
          </span>
          <div className="min-w-0">
            <p className="leading-snug">{l.quoi}</p>
            <p className="mt-0.5 text-ui tabular-nums text-muted-foreground">{l.quand}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
