'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ProjectionEcheance } from '@/types/message';

import { cn } from '@/lib/utils';

import { CadreDeCarte, Chiffre, CLASSE_DU_GESTE, LienDeCarte, TexteDeCarte, type TonDeLaCarte } from './CadreDeCarte';
import { EncaisserALaMain } from './FeuillesDesGestes';

interface CarteEcheanceProps {
  readonly objet: ProjectionEcheance;
  readonly conversationId: number;
}

/**
 * TCK-2962 — la carte d'une échéance de bail (loyer, charges), lue pour son lecteur :
 *
 * · le chiffre est le reste dû tant que l'échéance est ouverte, le montant une fois payée ;
 * · « Payer » sur `abilities.pay` (le locataire, un reste dû) : le parcours de paiement du locataire,
 *   `/app/payments` (choix du moyen parmi ceux que le serveur ouvre, puis
 *   `POST /api/lease-payments/{id}/initiate` et la page du fournisseur). La feuille `PayerUneEcheance`
 *   n'est pas montée dans le fil : elle lit l'espace `payments`, que la racine (le widget) ne sert pas ;
 * · « Encaisser à la main » sur `abilities.record_payment` : `POST /api/lease-payments/{id}/mark-paid`,
 *   réglée aujourd'hui avec son moyen (`EncaisserALaMain`).
 *
 * `abilities.remind` n'ouvre RIEN ici : `POST …/reminders` NOTE une relance faite par WhatsApp ou par
 * appel sur le téléphone du locataire, que la projection ne porte pas (aucun téléphone dans une carte).
 */
export function CarteEcheance({ objet, conversationId }: CarteEcheanceProps) {
  const t = useTranslations('messaging.cartes.echeance');
  const f = useFormatteurs();
  const [encaisser, setEncaisser] = useState(false);

  const paye = objet.status === 'paid';
  const annule = objet.status === 'cancelled' || objet.status === 'refunded';
  const retard = !paye && objet.is_overdue === true;
  const gestes = objet.abilities ?? {};
  const devise = objet.currency ?? null;
  const du = typeof objet.amount_due === 'number' ? objet.amount_due : null;
  const montant = paye ? objet.amount : (du ?? objet.amount);

  const periode = objet.period_start ? f.date(objet.period_start, { month: 'long', year: 'numeric', dateStyle: undefined }) : t('sansPeriode');
  const quoi =
    objet.payment_type === 'rent' ? t('quoiLoyer', { periode }) : objet.payment_type === 'charges' ? t('quoiCharges', { periode }) : t('quoi', { periode });
  const etat = paye ? t('paye') : annule ? t('annule') : retard ? t('enRetard') : objet.due_date ? t('avantLe', { date: f.jourMois(objet.due_date) }) : undefined;
  const ton: TonDeLaCarte = paye ? 'fait' : retard ? 'alerte' : gestes.pay === true ? 'attend' : 'calme';

  const payer =
    gestes.pay === true && du !== null ? (
      <Link href="/app/payments" className={cn(buttonVariants(), CLASSE_DU_GESTE)}>
        {t('payer')}
      </Link>
    ) : undefined;

  const encaissement =
    gestes.record_payment === true ? (
      <>
        <LienDeCarte onClick={() => setEncaisser(true)}>{t('encaisser')}</LienDeCarte>
        {encaisser ? (
          <EncaisserALaMain
            conversationId={conversationId}
            paiementId={objet.id}
            bailId={objet.lease_id}
            montant={f.montantCourt(du ?? objet.amount ?? null, devise)}
            open={encaisser}
            onOpenChange={setEncaisser}
          />
        ) : null}
      </>
    ) : undefined;

  return (
    <CadreDeCarte
      type="echeance"
      quoi={quoi}
      etat={etat}
      ton={ton}
      geste={payer}
      liens={encaissement}
      trace={paye && objet.paid_at ? t('payeLe', { date: f.jourMois(objet.paid_at) }) : undefined}
    >
      <Chiffre discret={paye || annule}>{f.montantCourt(montant ?? null, devise)}</Chiffre>
      {!paye && !annule && du !== null && objet.amount !== undefined && objet.amount !== du ? (
        <TexteDeCarte className="text-muted-foreground">{t('resteDu')}</TexteDeCarte>
      ) : null}
    </CadreDeCarte>
  );
}
