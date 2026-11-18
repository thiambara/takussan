'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import type { ProjectionReservation } from '@/types/message';

import { CadreDeCarte, CLASSE_DU_GESTE, LienDeCarte, TexteDeCarte, TitreDeCarte, useErreurDuGeste, type TonDeLaCarte } from './CadreDeCarte';
import { clesDeLObjet, useGesteDeLaCarte } from './useGesteDeLaCarte';

const ETATS: Readonly<Record<string, string>> = {
  confirmed: 'confirmee',
  rejected: 'refusee',
  cancelled: 'annulee',
  completed: 'terminee',
  expired: 'expiree',
};

/**
 * TCK-2962 — la carte d'une réservation. « Confirmer » sur `abilities.confirm`
 * (`POST /api/bookings/{id}/confirm`), « Refuser » sur `abilities.reject` (`…/reject`, sans motif : il est
 * facultatif), en deux temps pour qu'un refus ne parte pas d'un seul toucher.
 */
export function CarteReservation({ objet, conversationId }: { readonly objet: ProjectionReservation; readonly conversationId: number }) {
  const t = useTranslations('messaging.cartes.reservation');
  const f = useFormatteurs();
  const gestes = objet.abilities ?? {};
  const statut = objet.status ?? null;
  const confirme = gestes.confirm === true;
  const rejette = gestes.reject === true;
  const titre = objet.property?.title?.trim() || t('sansTitre');
  const client = objet.customer ? nomAffichable(objet.customer) : null;

  const etat = statut && ETATS[statut] ? t(ETATS[statut]) : statut === 'pending' ? (confirme ? t('aConfirmer') : t('enAttente')) : undefined;
  const ton: TonDeLaCarte = statut === 'confirmed' || statut === 'completed' ? 'fait' : statut === 'pending' && confirme ? 'attend' : 'calme';

  const contenu = (
    <>
      {objet.start_date && objet.end_date ? (
        <TitreDeCarte>{t('dates', { debut: f.jourMois(objet.start_date), fin: f.jourMois(objet.end_date) })}</TitreDeCarte>
      ) : null}
      {client ? <TexteDeCarte>{client}</TexteDeCarte> : null}
    </>
  );

  if (!confirme && !rejette) {
    return (
      <CadreDeCarte type="reservation" quoi={t('quoi', { titre })} etat={etat} ton={ton}>
        {contenu}
      </CadreDeCarte>
    );
  }
  return (
    <ReservationADecider objet={objet} conversationId={conversationId} quoi={t('quoi', { titre })} etat={etat} ton={ton}>
      {contenu}
    </ReservationADecider>
  );
}

function ReservationADecider({
  objet,
  conversationId,
  quoi,
  etat,
  ton,
  children,
}: {
  readonly objet: ProjectionReservation;
  readonly conversationId: number;
  readonly quoi: string;
  readonly etat: string | undefined;
  readonly ton: TonDeLaCarte;
  readonly children: React.ReactNode;
}) {
  const t = useTranslations('messaging.cartes.reservation');
  const erreurDuGeste = useErreurDuGeste();
  const geste = useGesteDeLaCarte(conversationId, clesDeLObjet.reservation(objet.id));
  const [refus, setRefus] = useState(false);
  const gestes = objet.abilities ?? {};

  const principal = refus ? (
    <Button
      type="button"
      variant="destructive"
      className={CLASSE_DU_GESTE}
      disabled={geste.isPending}
      onClick={() => geste.mutate({ chemin: cheminApi`/api/bookings/${objet.id}/reject` }, { onSettled: () => setRefus(false) })}
    >
      {t('confirmerLeRefus')}
    </Button>
  ) : gestes.confirm === true ? (
    <Button
      type="button"
      className={CLASSE_DU_GESTE}
      disabled={geste.isPending}
      aria-busy={geste.isPending || undefined}
      onClick={() => geste.mutate({ chemin: cheminApi`/api/bookings/${objet.id}/confirm` })}
    >
      {t('confirmer')}
    </Button>
  ) : undefined;

  const second = refus ? (
    <LienDeCarte onClick={() => setRefus(false)}>{t('garder')}</LienDeCarte>
  ) : gestes.reject === true ? (
    <LienDeCarte onClick={() => setRefus(true)} disabled={geste.isPending}>
      {t('refuser')}
    </LienDeCarte>
  ) : undefined;

  return (
    <CadreDeCarte type="reservation" quoi={quoi} etat={etat} ton={ton} geste={principal} liens={second} erreur={erreurDuGeste(geste.error)}>
      {children}
    </CadreDeCarte>
  );
}
