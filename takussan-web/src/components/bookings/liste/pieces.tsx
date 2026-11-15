'use client';

import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { initiales } from '@/lib/fiche-publique';
import { nomAffichable } from '@/lib/identite';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { ageDeLaDemande, montantDansLaNature, type NatureDeReservation } from '@/lib/reservations/liste-des-reservations';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';

import { BOOKING_STATUS_LABEL_KEY, BOOKING_STATUS_TONE } from '../booking-status';

/**
 * TCK-2594 — les pièces de la liste des réservations (maquette `app-reservations` a) : le
 * segmenté des natures, l'avatar et la vignette, le statut, et les mots de chaque nature.
 */

/**
 * Le nom du client (`nomAffichable`), prénom puis nom ; à défaut, « Client #12 ». Le numéro n'en tient
 * pas lieu : la ligne le dit déjà à côté, au personnel.
 */
export function useNomDuClient() {
  const t = useTranslations('bookings.liste');
  return (b: Pick<Booking, 'customer' | 'customer_id'>): string => {
    const id = b.customer_id ?? b.customer?.id ?? '';
    return nomAffichable({ id, first_name: b.customer?.first_name, last_name: b.customer?.last_name }, t('clientSansNom', { id: String(id) }));
  };
}

/** L'avatar à initiales de la maquette (`Avatar`), 36 % de sa taille. */
export function InitialesDuClient({ nom, taille, className }: { readonly nom: string; readonly taille: 34 | 40 | 44; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar font-semibold text-encre-avatar',
        // L'avatar de la maquette (`Math.round(taille × 0,36)`) sur les jetons de la primitive (rem fixes,
        // `size-avatar-N`, `text-avatar-N`) ; 34 px (le tableau du bureau) n'a pas de jeton : sa taille
        // sur l'échelle, son texte de 12 px.
        taille === 34 && 'size-[calc(var(--spacing)*8.5)] text-avatar-32',
        taille === 40 && 'size-avatar-40 text-avatar-40',
        taille === 44 && 'size-avatar-44 text-avatar-44',
        className,
      )}
    >
      {initiales(nom)}
    </span>
  );
}

/** La photo du bien en vignette (`Vignette` de la maquette) ; une icône sans photo. */
export function VignetteDuBien({ src, className }: { readonly src?: string | null; readonly className?: string }) {
  return (
    <span className={cn('relative inline-flex flex-none items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground', className)}>
      {src ? <Image src={src} alt="" fill sizes="64px" className="object-cover" /> : <ImageIcon className="size-5" aria-hidden="true" />}
    </span>
  );
}

/** Le statut d'une demande : « À décider » pour une demande en attente, puis le statut au singulier. */
export function StatutDeLaDemande({ statut, className }: { readonly statut: Booking['status']; readonly className?: string }) {
  const t = useTranslations('bookings');
  const libelle = statut === 'pending' ? t('liste.etat.pending') : t(BOOKING_STATUS_LABEL_KEY[statut]);
  return <StatusBadge tone={BOOKING_STATUS_TONE[statut]} label={libelle} className={className} />;
}

/** « Terrain à Dakar-Plateau · Dakar-Plateau » : le titre du bien et son quartier. */
export function useBienEtQuartier() {
  const t = useTranslations('bookings');
  return (b: Pick<Booking, 'property' | 'id'>): string => {
    const titre = b.property?.title?.trim() || t('fallbackTitle', { id: String(b.id) });
    const quartier = b.property?.location?.quarter?.trim();
    return quartier && !titre.includes(quartier) ? `${titre} · ${quartier}` : titre;
  };
}

/**
 * Les mots de la nature : le montant (« 3 nuits · 165 000 F », « Loyer 250 000 F/mois », « Offre
 * 85 000 000 F ») et sa ligne de détail (« 12 → 15 nov. », « Entrée 1 déc. », « Affiché 95 000 000 F
 * · −10,5 % »).
 */
export function useMotsDeLaNature() {
  const t = useTranslations('bookings.liste');
  const f = useFormatteurs();
  const montant = (b: Booking): string => {
    const m = montantDansLaNature(b);
    const somme = f.montantCourt(m.montant, b.currency);
    if (m.forme === 'nuits') return t('montant.nuits', { nuits: m.nuits, montant: somme });
    if (m.forme === 'loyer') return t('montant.loyer', { montant: somme });
    if (m.forme === 'offre') return t('montant.offre', { montant: somme });
    return somme;
  };
  const detail = (b: Booking): string | null => {
    const m = montantDansLaNature(b);
    if (m.forme === 'offre') {
      return m.affiche !== null && m.ecart !== null
        ? t('detail.offre', { affiche: f.montantCourt(m.affiche, b.currency), ecart: ecartEnClair(f.pourcentage(m.ecart, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })) })
        : null;
    }
    if (b.kind === 'stay' && b.start_date && b.end_date) return t('detail.sejour', { debut: f.jourMois(b.start_date), fin: f.jourMois(b.end_date) });
    if (b.kind === 'application' && b.start_date) return t('detail.entree', { date: f.jourMois(b.start_date) });
    return null;
  };
  return { montant, detail };
}

/** « −10,5 % » : le signe moins typographique (U+2212) de la maquette, et non le trait d'union d'`Intl`. */
export function ecartEnClair(pourcentage: string): string {
  return pourcentage.replace(/^-/, '\u2212');
}

/** « il y a 2 h », « hier », « il y a 4 j » ; au-delà d'une semaine, la date. */
export function useAgeDeLaDemande(maintenant: Date) {
  const t = useTranslations('bookings.liste');
  const f = useFormatteurs();
  return (creee: string): string => {
    const a = ageDeLaDemande(creee, maintenant);
    if (a.unite === 'date') return f.jourMois(creee, maintenant);
    if (a.unite === 'hier') return t('recue.hier');
    return t(`recue.${a.unite}`, { n: a.n });
  };
}

/**
 * Le segmenté Séjours · Candidatures · Offres (`Segmente` de la maquette), chacun avec son nombre
 * « à décider ». Sémantiquement un groupe radio : une nature, et une seule, est lue.
 */
export function SegmenteDesNatures({
  valeur,
  onChange,
  comptes,
  natures,
  className,
}: {
  readonly valeur: NatureDeReservation;
  readonly onChange: (n: NatureDeReservation) => void;
  readonly comptes: Readonly<Record<NatureDeReservation, number>> | null;
  readonly natures: readonly NatureDeReservation[];
  readonly className?: string;
}) {
  const t = useTranslations('bookings.liste.natures');
  return (
    <RadioGroupPrimitive
      aria-label={t('label')}
      value={valeur}
      onValueChange={(v) => onChange(v as NatureDeReservation)}
      className={cn('flex rounded-xl bg-muted p-1', className)}
    >
      {natures.map((n) => (
        <RadioPrimitive.Root
          key={n}
          value={n}
          className={cn(
            'group/nature inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm outline-none',
            'focus-visible:ring-3 focus-visible:ring-ring',
            'data-checked:bg-card data-checked:font-semibold data-checked:text-foreground data-checked:shadow-sm',
            'data-unchecked:font-medium data-unchecked:text-muted-foreground',
          )}
        >
          {t(n)}
          {/* Un compte nul ne se dit pas (maquette « Vide — personnel » : le segmenté sans chiffres). */}
          {comptes && comptes[n] > 0 ? <span className="tabular-nums text-muted-foreground group-data-checked/nature:text-primary-deep">{comptes[n]}</span> : null}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
