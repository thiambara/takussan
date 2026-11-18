'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ProjectionIntervention } from '@/types/message';

import { CadreDeCarte, Chiffre, CLASSE_DU_GESTE, LienDeCarte, TexteDeCarte, TitreDeCarte, useErreurDuGeste } from './CadreDeCarte';
import { RefuserLeDevis } from './FeuillesDesGestes';
import { ProposerUnAutreMoment } from './ProposerUnAutreMoment';
import { clesDeLObjet, useGesteDeLaCarte } from './useGesteDeLaCarte';

/** Après l'accord du devis : les travaux sont validés. */
const TRAVAUX_VALIDES = new Set(['approved', 'in_progress', 'completed', 'closed']);
const STATUTS_CONNUS = new Set([
  'open', 'acknowledged', 'quote_requested', 'quote_submitted', 'awaiting_owner', 'approved',
  'rejected', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled',
]);

export type VarianteDIntervention = 'devis' | 'passage' | 'intervention';

/** La variante de la carte d'après la famille du code : `maintenance.quote_*` → devis, `maintenance.slot_*` → passage. */
export function varianteDIntervention(code: string | undefined): VarianteDIntervention {
  if (code?.startsWith('maintenance.quote_')) return 'devis';
  if (code?.startsWith('maintenance.slot_')) return 'passage';
  return 'intervention';
}

interface CarteInterventionProps {
  readonly objet: ProjectionIntervention;
  readonly variante: VarianteDIntervention;
  readonly conversationId: number;
}

/**
 * TCK-2962 — la carte d'une intervention, lue pour SON lecteur depuis la projection (`object`) :
 *
 * · **devis** — le montant ne s'affiche qu'à qui LIT le devis, d'après ses droits (`can_view_quote_pdf`,
 *   `viewQuote` ; ou `can_decide_quote`), jamais d'après la présence de `quote_amount` ni un rôle : le
 *   demandeur lit « l'agence prépare les travaux ». « Approuver » et « Refuser » sur `can_decide_quote` ;
 * · **passage** — le moment prévu ; « Proposer un autre moment » sur `can_request_reschedule` (il n'existe
 *   aucune route pour que le demandeur confirme un passage : pas de « Confirmer ce moment ») ;
 * · **intervention** — le titre et l'étape.
 */
export function CarteIntervention({ objet, variante, conversationId }: CarteInterventionProps) {
  const t = useTranslations('messaging.cartes.intervention');
  const tStatut = useTranslations('messaging.maintenanceEvents.statuses');
  const f = useFormatteurs();
  const titre = objet.title?.trim() || t('sansTitre');
  const statut = objet.status ?? null;
  const etatEnMots = statut && STATUTS_CONNUS.has(statut) ? tStatut(statut) : undefined;
  const prestataire = objet.assignee?.name ?? objet.assignee?.full_name ?? null;
  const gestes = objet.abilities ?? {};

  if (variante === 'devis') {
    const decide = gestes.can_decide_quote === true;
    const litLeDevis = decide || gestes.can_view_quote_pdf === true;
    const valides = statut !== null && TRAVAUX_VALIDES.has(statut);
    const montant = litLeDevis && typeof objet.quote_amount === 'number' ? objet.quote_amount : null;

    if (montant === null) {
      return (
        <CadreDeCarte type="devis" quoi={t('quoiDevis', { titre })} etat={valides ? t('valides') : t('enPreparation')} ton={valides ? 'fait' : 'calme'}>
          <TitreDeCarte>{valides ? t('titreValides') : t('titrePreparation')}</TitreDeCarte>
          {prestataire ? <TexteDeCarte>{t('par', { nom: prestataire })}</TexteDeCarte> : null}
        </CadreDeCarte>
      );
    }
    return decide ? (
      <DevisADecider objet={objet} conversationId={conversationId} titre={titre} montant={f.montantCourt(montant, objet.quote_currency)} prestataire={prestataire} />
    ) : (
      <CadreDeCarte type="devis" quoi={t('quoiDevis', { titre })} etat={valides ? t('valides') : etatEnMots} ton={valides ? 'fait' : 'calme'}>
        <Chiffre discret={valides}>{f.montantCourt(montant, objet.quote_currency)}</Chiffre>
        {prestataire ? <TexteDeCarte>{t('par', { nom: prestataire })}</TexteDeCarte> : null}
      </CadreDeCarte>
    );
  }

  if (variante === 'passage') {
    const prevu = objet.scheduled_at ?? null;
    return (
      <CadreDeCarte
        type="passage"
        quoi={t('quoiPassage', { titre })}
        etat={prevu ? t('prevu') : t('aFixer')}
        liens={gestes.can_request_reschedule === true ? <AutreMoment conversationId={conversationId} interventionId={objet.id} /> : undefined}
      >
        {prevu ? (
          <>
            <p className="font-display text-affiche-22 leading-tight font-semibold tracking-titre">{f.date(prevu, { weekday: 'long', day: 'numeric', month: 'long', dateStyle: undefined })}</p>
            <p className="mt-0.5 font-display text-titre-court font-medium text-muted-foreground tabular-nums">{f.heure(prevu)}</p>
          </>
        ) : null}
        {prestataire ? <TexteDeCarte>{t('par', { nom: prestataire })}</TexteDeCarte> : null}
      </CadreDeCarte>
    );
  }

  return (
    <CadreDeCarte type="intervention" quoi={t('quoi', { titre })} etat={etatEnMots}>
      <TitreDeCarte>{titre}</TitreDeCarte>
      {prestataire ? <TexteDeCarte>{t('par', { nom: prestataire })}</TexteDeCarte> : null}
    </CadreDeCarte>
  );
}

function DevisADecider({
  objet,
  conversationId,
  titre,
  montant,
  prestataire,
}: {
  readonly objet: ProjectionIntervention;
  readonly conversationId: number;
  readonly titre: string;
  readonly montant: string;
  readonly prestataire: string | null;
}) {
  const t = useTranslations('messaging.cartes.intervention');
  const erreurDuGeste = useErreurDuGeste();
  const geste = useGesteDeLaCarte(conversationId, clesDeLObjet.intervention());
  const [refus, setRefus] = useState(false);

  return (
    <CadreDeCarte
      type="devis"
      quoi={t('quoiDevis', { titre })}
      etat={t('aVousDApprouver')}
      ton="attend"
      erreur={erreurDuGeste(geste.error)}
      geste={
        <Button
          type="button"
          className={CLASSE_DU_GESTE}
          disabled={geste.isPending}
          aria-busy={geste.isPending || undefined}
          onClick={() => geste.mutate({ chemin: cheminApi`/api/maintenance-requests/${objet.id}/quote/approve` })}
        >
          {t('approuver')}
        </Button>
      }
      liens={
        <LienDeCarte onClick={() => setRefus(true)} disabled={geste.isPending}>
          {t('refuser')}
        </LienDeCarte>
      }
    >
      <Chiffre>{montant}</Chiffre>
      {prestataire ? <TexteDeCarte>{t('par', { nom: prestataire })}</TexteDeCarte> : null}
      {refus ? <RefuserLeDevis conversationId={conversationId} interventionId={objet.id} open={refus} onOpenChange={setRefus} /> : null}
    </CadreDeCarte>
  );
}

function AutreMoment({ conversationId, interventionId }: { readonly conversationId: number; readonly interventionId: number }) {
  const t = useTranslations('messaging.cartes.intervention');
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <LienDeCarte onClick={() => setOuvert(true)}>{t('proposerUnAutreMoment')}</LienDeCarte>
      {ouvert ? <ProposerUnAutreMoment conversationId={conversationId} interventionId={interventionId} open={ouvert} onOpenChange={setOuvert} /> : null}
    </>
  );
}
