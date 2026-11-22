'use client';

import { useTranslations } from 'next-intl';
import { Reply } from 'lucide-react';

import type { Formatteurs } from '@/lib/format/useFormatteurs';
import { contreOffreARepondre } from '@/lib/reservations/appel-du-client';
import type { Booking, BookingCounterOffer, OfferFinancing } from '@/types/booking';
import type { EvenementDeLHistorique } from './historique';

/**
 * TCK-2876 (ADR-0110 § 5) — la contre-offre de l'agence dans la fiche d'une offre d'achat.
 *
 * L'API ne sert que la DERNIÈRE contre-offre (`counter_offer`) : une contre-offre remplacée
 * (`superseded`) ne se relit donc pas ici, seulement la plus récente et sa réponse.
 */

/** Ouverte : elle attend la réponse du client (`awaiting = customer`). Une déclinée ou échue n'est plus « en cours ». */
// TCK-2879 — une seule règle pour la fiche et la carte du client (`lib/reservations/appel-du-client.ts`).
export function contreOffreEnCours(b: Booking): BookingCounterOffer | null {
  return contreOffreARepondre(b);
}

/** « Ibrahima » → élision devant une voyelle : « en attente d’Ibrahima ». */
function elision(nom: string): 'oui' | 'non' {
  return /^[aeiouyàâäéèêëîïôöùûüœ]/i.test(nom.trim()) ? 'oui' : 'non';
}

/** « Lun. 16 nov. » : un JOUR de l'API (`AAAA-MM-JJ`), lu à midi pour ne glisser dans aucun fuseau. */
export function jourDeLaContreOffre(f: Formatteurs, jour: string): string {
  const texte = f.date(`${jour.slice(0, 10)}T12:00:00Z`, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** En tête du Quoi : « Contre-offre de 90 000 000 F envoyée · en attente d’Ibrahima jusqu’au lun. 16 nov. » */
export function ContreOffreEnCours({ co, prenom, montant, f }: { readonly co: BookingCounterOffer; readonly prenom: string; readonly montant: string; readonly f: Formatteurs }) {
  const t = useTranslations('bookings.fiche.contreOffre');
  const jour = co.valid_until ? jourDeLaContreOffre(f, co.valid_until) : null;
  return (
    <div data-slot="contre-offre-en-cours" className="flex gap-2.5 rounded-lg border border-primary/30 bg-secondary/60 p-3 text-sm leading-snug">
      <Reply className="mt-0.5 size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" />
      <p>
        <span className="font-medium">{t('envoyee', { montant })}</span>
        {' · '}
        <span className="text-muted-foreground">
          {jour ? t('enAttenteJusquA', { elision: elision(prenom), prenom, date: jour.charAt(0).toLowerCase() + jour.slice(1) }) : t('enAttente', { elision: elision(prenom), prenom })}
        </span>
      </p>
    </div>
  );
}

/** Les libellés du financement, par code (`OfferFinancing`). */
export function useLibelleDuFinancement(): (code: OfferFinancing | null | undefined) => string | null {
  const t = useTranslations('bookings.fiche.financement');
  return (code) => (code && t.has(code) ? t(code) : null);
}

/**
 * L'historique de la contre-offre : son envoi, puis sa réponse (acceptée, déclinée — à l'instant de
 * la réponse) ou son échéance (le soir du dernier jour, à Dakar).
 */
export function useEvenementsDeLaContreOffre(): (co: BookingCounterOffer | null | undefined, montant: (v: number) => string) => EvenementDeLHistorique[] {
  const t = useTranslations('bookings.fiche.contreOffre');
  return (co, montant) => {
    if (!co) return [];
    const evenements: EvenementDeLHistorique[] = [];
    if (co.created_at) evenements.push({ cle: `contre-offre-${co.id}`, at: co.created_at, quoi: t('envoyee', { montant: montant(co.amount) }) });
    const reponse = co.status === 'expired' ? (co.valid_until ? `${co.valid_until.slice(0, 10)}T23:59:59Z` : null) : co.responded_at;
    if (reponse && co.status !== 'pending') {
      evenements.push({ cle: `contre-offre-${co.id}-${co.status}`, at: reponse, quoi: t(`statut.${co.status}`) });
    }
    return evenements;
  };
}
