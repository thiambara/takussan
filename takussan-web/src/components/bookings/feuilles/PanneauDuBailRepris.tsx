'use client';

// TCK-2878 — le nom d'un garant, par la règle du nom affichable.
import { nomAffichable } from '@/lib/identite';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { formaterTelephone } from '@/lib/phone';
import { useCreerLeBailRepris } from '@/lib/queries/candidature-et-bail';
import { useLeaseDefaults } from '@/lib/queries/leases';
import { termesDuBailRepris } from '@/lib/reservations/candidature';
import type { Booking } from '@/types/booking';

import { FeuilleOuPanneau } from './pieces-des-feuilles';

interface PanneauDuBailReprisProps {
  readonly booking: Booking;
  readonly nom: string;
  readonly prenom: string;
  /** Le bien de la demande (photo, titre, prix affiché), tel que la fiche le montre. */
  readonly bien: ReactNode;
  readonly onOpenChange: (open: boolean) => void;
}

/** Un champ repris, en lecture : son libellé, sa valeur, une aide facultative (maquette : `Champ`). */
function ChampRepris({ libelle, valeur, aide, large }: { readonly libelle: string; readonly valeur: ReactNode; readonly aide?: string | null; readonly large?: boolean }) {
  return (
    <div className={large ? 'col-span-2' : undefined}>
      <dt className="text-xs font-medium text-muted-foreground">{libelle}</dt>
      <dd className="mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums">{valeur}</dd>
      {aide ? <dd className="mt-1 text-xs text-muted-foreground">{aide}</dd> : null}
    </div>
  );
}

/**
 * TCK-2878 (maquette `app-fil-commercial` a, e7 bureau, l. 684-713) — « Nouveau bail · repris de la
 * candidature » : le bail se crée sans quitter la candidature acceptée, avec ce qu'elle disait déjà.
 *
 *  · Le loyer est celui de la CANDIDATURE (le prix du bien à sa création, ADR-0102 § 3), jamais le
 *    prix courant du bien ; la caution, la sienne ; la fin, celle de son terme (TCK-2894).
 *  · `guarantor_id` n'est jamais envoyé : l'API rattache au bail les garants de la candidature.
 *  · « Ouvrir le formulaire complet » mène au formulaire prérempli des mêmes valeurs.
 *  · Signé, le bail occupe le bien dès son début (`Occupation::occupying`) ; la fiche du client se
 *    voit PROPOSER l'étape Gagné (`CustomerSuggestedStageQuery::LEASE_SIGNED`), elle n'y passe pas
 *    seule : la phrase le dit.
 *
 * Monté ouvert seulement (il porte sa mutation et lit les défauts du bien : le type du bail).
 */
export function PanneauDuBailRepris({ booking, nom, prenom, bien, onOpenChange }: PanneauDuBailReprisProps) {
  const t = useTranslations('bookings.fiche.bailRepris');
  const tFiche = useTranslations('bookings.fiche');
  const f = useFormatteurs();
  const router = useRouter();
  const messageErreur = useMessageErreurApi();
  const creer = useCreerLeBailRepris(booking.id);
  const defauts = useLeaseDefaults(booking.property_id);
  const [erreur, setErreur] = useState<string | null>(null);
  const devise = booking.currency ?? booking.property?.currency ?? 'XOF';
  const termes = termesDuBailRepris(booking);
  const garants = booking.guarantors ?? [];
  const pieceDuGarantManquante = booking.dossier?.missing.includes('guarantor_identity') ?? false;
  const telephone = booking.customer?.phone ? formaterTelephone(booking.customer.phone) : null;
  const type = defauts.data?.data?.property_id === booking.property_id ? defauts.data.data.type : null;

  const champs: { readonly cle: string; readonly libelle: string; readonly valeur: ReactNode; readonly aide?: string | null }[] = [
    { cle: 'locataire', libelle: t('locataire'), valeur: [nom, telephone].filter(Boolean).join(' · '), aide: t('locataireAide') },
    ...(termes.start_date
      ? [{ cle: 'debut', libelle: t('debut'), valeur: f.date(termes.start_date, { dateStyle: undefined, day: 'numeric', month: 'short', year: 'numeric' }) }]
      : []),
    ...(booking.term_months
      ? [{ cle: 'duree', libelle: t('duree'), valeur: tFiche('quoi.dureeValeur', { n: booking.term_months, renouvelable: booking.renewable ? 'oui' : 'non' }) }]
      : []),
    ...(termes.monthly_rent !== undefined ? [{ cle: 'loyer', libelle: t('loyer'), valeur: f.montantCourt(termes.monthly_rent, devise) }] : []),
    ...(termes.deposit_amount !== undefined
      ? [
          {
            cle: 'caution',
            libelle: t('caution'),
            valeur: f.montantCourt(termes.deposit_amount, devise),
            aide: booking.security_deposit_months != null ? tFiche('quoi.cautionMois', { n: booking.security_deposit_months }) : null,
          },
        ]
      : []),
  ];
  const garant =
    garants.length > 0
      ? {
          cle: 'garant',
          libelle: t('garant'),
          valeur: garants
            .map((g) => [nomAffichable(g), g.relationship_to_tenant].filter(Boolean).join(' · '))
            .join(', '),
          aide: pieceDuGarantManquante ? t('garantAide') : null,
        }
      : null;
  const repris = champs.length + (garant ? 1 : 0);

  const surCreer = async () => {
    setErreur(null);
    if (!type || !termes.start_date) return;
    try {
      const cree = await creer.mutateAsync({
        property_id: booking.property_id,
        tenant_id: booking.customer_id,
        booking_id: booking.id,
        type,
        start_date: termes.start_date,
        ...(termes.end_date ? { end_date: termes.end_date } : {}),
        ...(termes.monthly_rent !== undefined ? { monthly_rent: termes.monthly_rent } : {}),
        ...(termes.deposit_amount !== undefined ? { deposit_amount: termes.deposit_amount } : {}),
        currency: devise,
      });
      router.push(`/app/leases/${cree.data.id}`);
    } catch (e) {
      setErreur(messageErreur(e, t('echec')));
    }
  };

  const pied = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
        {t('annuler')}
      </Button>
      <Link href={`/app/leases/new?booking_id=${booking.id}`} className={buttonVariants({ variant: 'outline' })}>
        {t('formulaire')}
      </Link>
      <Button type="button" onClick={() => void surCreer()} disabled={creer.isPending || !type || !termes.start_date}>
        {t('creer')}
      </Button>
    </div>
  );

  return (
    <FeuilleOuPanneau open onOpenChange={onOpenChange} titre={t('titre')} pied={pied}>
      <div data-slot="panneau-du-bail-repris" className="space-y-4 pt-1">
        <div className="rounded-xl border border-border bg-card p-3">{bien}</div>
        <dl className="grid grid-cols-2 gap-3">
          {champs.map((c) => (
            <ChampRepris key={c.cle} libelle={c.libelle} valeur={c.valeur} aide={c.aide} large={c.cle === 'locataire'} />
          ))}
          {garant ? <ChampRepris libelle={garant.libelle} valeur={garant.valeur} aide={garant.aide} large /> : null}
        </dl>
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-ui leading-snug text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 flex-none text-success" aria-hidden="true" />
          {t('repris', { n: repris, prenom })}
        </p>
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
    </FeuilleOuPanneau>
  );
}
