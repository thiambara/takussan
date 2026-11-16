'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';

/**
 * TCK-2912 — le brouillon de la création d'un bail (maquette `app-baux` a, écran « Création — étape 3 ») :
 * « Brouillon » à droite de l'en-tête du téléphone, « brouillon enregistré à 10:42 » sous le titre du
 * bureau.
 *
 * L'en-tête du bureau (`PageHeader`) est rendu par la PAGE, côté serveur ; l'enregistrement vit dans le
 * formulaire, côté client. Ce contexte les relie : la page enveloppe l'en-tête et le formulaire de
 * {@link SuiviDuBrouillon}, le formulaire pose l'heure du dernier enregistrement servi par l'API
 * (`updated_at` du brouillon), et {@link MentionDuBrouillon} l'écrit à la suite du sous-titre.
 */

interface Suivi {
  readonly enregistreLe: string | null;
  readonly poser: (instant: string | null) => void;
}

const ContexteDuBrouillon = createContext<Suivi | null>(null);

export function SuiviDuBrouillon({ children }: { readonly children: ReactNode }) {
  const [enregistreLe, poser] = useState<string | null>(null);
  const valeur = useMemo(() => ({ enregistreLe, poser }), [enregistreLe]);
  return <ContexteDuBrouillon.Provider value={valeur}>{children}</ContexteDuBrouillon.Provider>;
}

/** Ce que le formulaire pose : l'instant du dernier enregistrement (`null` : aucun brouillon). Sans suivi, rien. */
export function usePoserLeBrouillon(): (instant: string | null) => void {
  return useContext(ContexteDuBrouillon)?.poser ?? rienAPoser;
}

function rienAPoser() {}

/** Le sous-titre du bureau, suivi de « brouillon enregistré à 10:42 » dès qu'un enregistrement a eu lieu. */
export function MentionDuBrouillon({ texte }: { readonly texte: string }) {
  const t = useTranslations('lease.form.brouillon');
  const f = useFormatteurs();
  const enregistreLe = useContext(ContexteDuBrouillon)?.enregistreLe ?? null;
  return (
    <>
      {texte}
      {enregistreLe ? (
        <span data-testid="brouillon-enregistre">
          {' · '}
          {t('enregistreA', { heure: f.heure(enregistreLe) })}
        </span>
      ) : null}
    </>
  );
}

/**
 * La clé du brouillon : dérivée de l'adresse seule (`?booking_id=`, `?property=`, `?customer=`), pour
 * qu'un rechargement de la même page retrouve la même saisie — « même clé par bien » (ticket).
 * Une clé hors des règles de reprise de `lib/wizard-drafts.ts` : le bandeau de l'accueil ne la propose
 * pas (aucune adresse de reprise à y inscrire au-delà de la page elle-même).
 */
export function cleDuBrouillonDeBail({ bookingId, propertyId, customerId }: { readonly bookingId?: number; readonly propertyId?: number; readonly customerId?: number }): string {
  return ['lease-new', bookingId ? `booking-${bookingId}` : null, propertyId ? `property-${propertyId}` : null, customerId ? `customer-${customerId}` : null]
    .filter(Boolean)
    .join('.');
}
