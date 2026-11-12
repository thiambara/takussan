'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, ClipboardCheck, FileText, Phone, Send, UserRound, Wallet } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { initialesDe, nomAffichable } from '@/lib/identite';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { OccupationDuBien, PropertyDetail } from '@/types/property';

import type { LocationDuBien } from './useLocationDuBien';

/**
 * TCK-2639 — les pièces de l'onglet « Location » et de la carte « Occupation » (maquette `app-biens`,
 * approche a : `BlocOccupant`, `BlocCeMois`, `BlocAVenir`, `BlocBailleur`). Elles ne lisent que le
 * bloc `occupancy` et les lectures d'appoint de {@link LocationDuBien} : aucune ne recalcule l'état.
 */

export function Carte({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>{children}</div>;
}

export function TitreBloc({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return (
    <div className={className}>
      <h3 className="text-ui leading-normal font-semibold text-muted-foreground">{children}</h3>
    </div>
  );
}

/** Une ligne « clé · valeur » de carte (bail en cours, occupation). */
export function Cle({ k, v, fort = false }: { readonly k: ReactNode; readonly v: ReactNode; readonly fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn('min-w-0 text-right tabular-nums', fort ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>{v}</dd>
    </div>
  );
}

/** Une ligne de carte : icône, titre, détail, et un lien quand elle mène quelque part. */
export function LigneLien({
  icone,
  titre,
  detail,
  href,
  className,
}: {
  readonly icone: ReactNode;
  readonly titre: ReactNode;
  readonly detail?: ReactNode;
  readonly href?: string | null;
  readonly className?: string;
}) {
  const corps = (
    <>
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">{icone}</span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block truncate text-corps font-medium text-foreground">{titre}</span>
        {detail ? <span className="block truncate text-ui text-muted-foreground">{detail}</span> : null}
      </span>
      {href ? <ChevronRight className="size-4 flex-none stroke-2 text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  const classes = cn('flex min-h-14 items-center gap-3 px-4 py-2.5', className);
  return href ? (
    <Link href={href} className={cn(classes, 'outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring')}>
      {corps}
    </Link>
  ) : (
    <div className={classes}>{corps}</div>
  );
}

/** Le nom du locataire tel que l'API le rend ; `null` quand la projection le retire (TCK-2637). */
export function nomDuLocataire(occupation: OccupationDuBien | null): string | null {
  const locataire = occupation?.tenant ?? null;
  return locataire ? nomAffichable(locataire) : null;
}

/** Les boutons ronds « Appeler » / « WhatsApp » d'un numéro joignable ; rien sans numéro. */
export function Appels({ telephone, nom, petit = false }: { readonly telephone: string | null; readonly nom: string; readonly petit?: boolean }) {
  const t = useTranslations('property.dashboard.fiche.occupant');
  if (!isReachable(telephone)) return null;
  const rond = cn(
    'inline-flex flex-none items-center justify-center rounded-full border border-border bg-card outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
    petit ? 'size-9' : 'size-11',
  );
  return (
    <span className="flex flex-none items-center gap-2">
      <a href={telHref(telephone)} aria-label={t('appeler', { nom })} className={rond}>
        <Phone className={petit ? 'size-4' : 'size-icone'} strokeWidth={1.75} aria-hidden="true" />
      </a>
      <a
        href={whatsappHref(telephone, '')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('whatsapp', { nom })}
        className={cn(rond, 'border-transparent bg-success/10 text-success hover:bg-success/15')}
      >
        {/* `lg:` aussi : l'icône pose `lg:size-5` d'elle-même. */}
        <IconeWhatsApp className={petit ? 'size-4 lg:size-4' : 'size-icone lg:size-icone'} />
      </a>
    </span>
  );
}

/** Les initiales d'un nom affiché (« Mariama Sow » → « MS ») : le bailleur ne porte qu'un `name`. */
export function initialesDuNom(nom: string | null): string | null {
  if (!nom) return null;
  const lettres = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => Array.from(mot)[0] ?? '')
    .join('');
  return lettres !== '' ? lettres.toUpperCase() : null;
}

export function AvatarDe({ initiales, taille = '44' }: { readonly initiales: string | null; readonly taille?: '40' | '44' }) {
  return (
    <Avatar size={taille}>
      <AvatarFallback className="text-sm font-semibold">
        <span aria-hidden="true">{initiales ?? '?'}</span>
      </AvatarFallback>
    </Avatar>
  );
}

/** « Bail LS-… · type · début → fin › » : la ligne qui mène au bail (AC1). */
export function LigneDuBail({ occupation, className }: { readonly occupation: OccupationDuBien; readonly className?: string }) {
  const t = useTranslations('property.dashboard.fiche.bail');
  const tTypes = useTranslations('lease.types');
  const f = useFormatteurs();
  const bail = occupation.lease;
  if (!bail) {
    return <p className={cn('px-4 py-3 text-sm text-muted-foreground', className)}>{t('illisible')}</p>;
  }
  const type = bail.type && tTypes.has(bail.type) ? tTypes(bail.type) : null;
  const debut = bail.start_date ? f.date(bail.start_date) : null;
  const fin = bail.end_date ? f.date(bail.end_date) : null;
  const periode = debut && fin ? t('periode', { debut, fin }) : debut ? t('depuis', { debut }) : null;
  return (
    <LigneLien
      className={className}
      href={`/app/leases/${bail.id}`}
      icone={<FileText className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
      titre={bail.reference_number ? t('reference', { reference: bail.reference_number }) : t('sansReference')}
      detail={[type, periode].filter(Boolean).join(' · ') || null}
    />
  );
}

/** « Occupé par … » avec Appeler / WhatsApp, puis la ligne du bail. */
export function BlocOccupant({ occupation, className }: { readonly occupation: OccupationDuBien; readonly className?: string }) {
  const t = useTranslations('property.dashboard.fiche.occupant');
  const nom = nomDuLocataire(occupation);
  return (
    <Carte className={className}>
      <div className="flex items-center gap-3 p-4">
        <AvatarDe initiales={occupation.tenant ? initialesDe(occupation.tenant) : null} />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="text-ui text-muted-foreground">{occupation.state === 'notice' ? t('enPreavis') : t('occupePar')}</p>
          <p className="truncate text-base font-semibold" data-testid="nom-du-locataire">
            {nom ?? t('locataire')}
          </p>
        </div>
        {nom ? <Appels telephone={occupation.tenant?.phone ?? null} nom={nom} /> : null}
      </div>
      <LigneDuBail occupation={occupation} className="border-t border-border" />
    </Carte>
  );
}

/** Le libellé du mois d'une échéance (« Novembre ») et son jour (« 5 »). */
export function useMoisDeLEcheance() {
  const f = useFormatteurs();
  return (date: string) => {
    const mois = f.date(date, { month: 'long' });
    return { mois: mois.charAt(0).toLocaleUpperCase(f.locale) + mois.slice(1), jour: f.date(date, { day: 'numeric' }) };
  };
}

/**
 * « Ce mois » : le loyer AVEC sa période, l'état du mois (payé, en retard de N j, en partie, à
 * échéance), la pénalité due, la période d'avant si elle est réglée, et les gestes « Relancer » / « Encaisser » quand ils ont un objet.
 */
export function BlocCeMois({
  property,
  location,
  etat,
  gestes,
  className,
}: {
  readonly property: PropertyDetail;
  readonly location: LocationDuBien;
  /** La puce de l'état du mois (`PuceEtatDuMois`), rendue par l'appelant. */
  readonly etat: ReactNode;
  readonly gestes?: { readonly onRelancer: (() => void) | null; readonly onEncaisser: (() => void) | null } | null;
  readonly className?: string;
}) {
  const t = useTranslations('property.dashboard.fiche.ceMois');
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const f = useFormatteurs();
  const moisDe = useMoisDeLEcheance();
  const mois = location.occupation?.current_month ?? null;
  const loyer = location.occupation?.rent ?? null;
  const devise = loyer?.currency ?? property.currency ?? 'XOF';
  const paye = location.ligneDuMois?.paid_at ?? null;
  const penalite = mois?.late_fee_outstanding ?? 0;
  const regle = location.precedentRegle;
  const precedent =
    regle?.due_date && regle.paid_at
      ? { mois: moisDe(regle.due_date).mois.toLocaleLowerCase(f.locale), date: f.jourMois(regle.paid_at, new Date(regle.paid_at)) }
      : null;
  return (
    <Carte className={cn('p-4', className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ui leading-normal text-muted-foreground">
            {mois?.due_date ? t('echeance', moisDe(mois.due_date)) : t('sansEcheance')}
          </p>
          {loyer ? (
            <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums tracking-titre">
              {f.montantCourt(loyer.amount, devise)}
              {/* Contraintes strictes du ticket : le loyer se dit toujours avec sa période. */}
              <span className="text-base font-normal text-muted-foreground"> / {tPeriodes(loyer.payment_frequency ?? 'monthly')}</span>
            </p>
          ) : null}
        </div>
        {etat}
      </div>
      {penalite > 0 || (mois?.status === 'paid' && paye) || precedent ? (
        <p className="mt-2 text-ui leading-normal text-muted-foreground">
          {penalite > 0 ? (
            <>
              {t('penalite')} <span className="font-medium tabular-nums text-foreground">{f.montantCourt(penalite, devise)}</span>
            </>
          ) : mois?.status === 'paid' && paye ? (
            t('payeLe', { date: f.date(paye) })
          ) : null}
          {/* Maquette a-2 : « · octobre payé le 29 oct. » — la période d'avant, quand elle est réglée. */}
          {precedent ? (
            <>
              {penalite > 0 || (mois?.status === 'paid' && paye) ? ' · ' : null}
              {t('precedentPaye', { mois: precedent.mois, date: precedent.date })}
            </>
          ) : null}
        </p>
      ) : null}
      {gestes && !gestes.onRelancer && !gestes.onEncaisser && location.gestesEnLecture ? (
        // La place des gestes, tant que le bail et l'échéancier se lisent (`gestesEnLecture`).
        <div className="invisible mt-3 flex gap-2" aria-hidden="true" data-slot="gestes-en-lecture">
          <Button type="button" variant="outline" className="flex-1" tabIndex={-1}>
            {t('relancer')}
          </Button>
          <Button type="button" className="flex-1" tabIndex={-1}>
            {t('encaisser')}
          </Button>
        </div>
      ) : null}
      {gestes && (gestes.onRelancer || gestes.onEncaisser) ? (
        <div className="mt-3 flex gap-2">
          {gestes.onRelancer ? (
            <Button type="button" variant="outline" className="flex-1" onClick={gestes.onRelancer}>
              <Send className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t('relancer')}
            </Button>
          ) : null}
          {gestes.onEncaisser ? (
            <Button type="button" variant="sombre" className="flex-1" onClick={gestes.onEncaisser}>
              <Wallet className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {t('encaisser')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Carte>
  );
}

/** « À venir » : le prochain loyer et l'état des lieux d'entrée du bail. */
export function BlocAVenir({ property, location, className }: { readonly property: PropertyDetail; readonly location: LocationDuBien; readonly className?: string }) {
  const t = useTranslations('property.dashboard.fiche.aVenir');
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const f = useFormatteurs();
  const loyer = location.occupation?.rent ?? null;
  const edl = location.etatDesLieux.data?.data[0] ?? null;
  const detailEdl = (() => {
    if (location.etatDesLieux.isError) return t('edl.echec');
    if (!location.etatDesLieux.data) return null;
    if (!edl) return t('edl.aucun');
    switch (edl.status) {
      case 'signed':
        return edl.signed_at || edl.owner_signed_at ? t('edl.signe', { date: f.date(edl.signed_at ?? edl.owner_signed_at) }) : t('edl.signeSansDate');
      case 'pending_signature':
        return t('edl.enAttente');
      case 'disputed':
        return t('edl.conteste');
      default:
        return t('edl.brouillon');
    }
  })();
  return (
    <Carte className={cn('divide-y divide-border', className)}>
      {location.prochainLoyer ? (
        <LigneLien
          icone={<Wallet className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
          titre={t('prochainLoyer', { date: f.jourMois(location.prochainLoyer) })}
          detail={
            loyer
              ? `${f.montantCourt(loyer.amount, loyer.currency ?? property.currency ?? 'XOF')} / ${tPeriodes(loyer.payment_frequency ?? 'monthly')}`
              : null
          }
        />
      ) : null}
      <LigneLien
        icone={<ClipboardCheck className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
        titre={t('edl.titre')}
        detail={detailEdl}
        href={edl ? `/app/inventories/${edl.id}` : null}
      />
    </Carte>
  );
}

/** « Bailleur : … › » — vers la fiche du bailleur quand l'appelant l'ouvre (TCK-2641). */
export function BlocBailleur({ property, lien, className }: { readonly property: PropertyDetail; readonly lien: boolean; readonly className?: string }) {
  const t = useTranslations('property.dashboard.fiche.bailleur');
  const nom = property.owner?.name ?? null;
  const href = lien && property.owner_profile_id ? `/app/owners/${property.owner_profile_id}` : null;
  const corps = (
    <>
      <AvatarDe initiales={initialesDuNom(nom)} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-sm text-muted-foreground">{t('titre')}</p>
        <p className="truncate text-base font-semibold">{nom ?? t('inconnu')}</p>
      </div>
      {href ? <ChevronRight className="size-4 flex-none stroke-2 text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  return (
    <Carte className={className}>
      {href ? (
        <Link href={href} className="flex items-center gap-3 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring">
          {corps}
        </Link>
      ) : (
        <div className="flex items-center gap-3 p-4">{corps}</div>
      )}
    </Carte>
  );
}

/**
 * TCK-2639 (TCK-603) — l'agent responsable du bien, sous le bailleur (maquette a-2 : « Mandat » au
 * téléphone, sous la carte « Occupation » au bureau). La même lecture que `ProprietaireEtResponsable` :
 * un agent DÉSIGNÉ (ou celui de l'ordre d'invitation) ; un repli n'est pas un responsable. Rien tant que
 * l'API ne dit pas d'où vient le contact.
 */
export function BlocResponsable({ property, className }: { readonly property: PropertyDetail; readonly className?: string }) {
  const t = useTranslations('property.dashboard.fiche.responsable');
  const source = property.primary_contact_source;
  if (property.primary_contact === undefined || source === undefined) return null;
  const responsable = source === 'designated' || source === 'invitation_order' ? (property.primary_contact ?? null) : null;
  return (
    <Carte className={className}>
      <LigneLien
        icone={<UserRound className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
        titre={responsable?.name ?? t('aucun')}
        detail={t('detail')}
      />
    </Carte>
  );
}
