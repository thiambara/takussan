'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ProjectionVisite } from '@/types/message';

import { CadreDeCarte, CLASSE_DU_GESTE, TexteDeCarte, useErreurDuGeste, type TonDeLaCarte } from './CadreDeCarte';
import { clesDeLObjet, useGesteDeLaCarte } from './useGesteDeLaCarte';

const ETATS: Readonly<Record<string, string>> = {
  confirmed: 'confirmee',
  completed: 'terminee',
  cancelled: 'annulee',
  no_show: 'manquee',
};

/**
 * TCK-2962 — la carte d'une visite (elle vit dans la conversation du client). « Confirmer ce moment » sur
 * `abilities.confirm`, pour une visite encore à confirmer (`POST /api/property-visits/{id}/confirm`) ; une
 * demande par tranche sans heure est refusée par l'API (422 `visit.time_required`), et le refus se dit
 * sous le geste. « Proposer un autre moment » n'a pas d'`ability` dans la projection : il ne s'affiche pas.
 */
export function CarteVisite({ objet, conversationId }: { readonly objet: ProjectionVisite; readonly conversationId: number }) {
  const t = useTranslations('messaging.cartes.visite');
  const f = useFormatteurs();
  const statut = objet.status ?? null;
  const peutConfirmer = statut === 'scheduled' && objet.abilities?.confirm === true;
  const titre = objet.property?.title?.trim() || '—';
  const etat = statut && ETATS[statut] ? t(ETATS[statut]) : statut === 'scheduled' ? (peutConfirmer ? t('aConfirmer') : t('enAttente')) : undefined;
  const ton: TonDeLaCarte = statut === 'confirmed' || statut === 'completed' ? 'fait' : peutConfirmer ? 'attend' : 'calme';

  const contenu = objet.scheduled_at ? (
    <>
      <p className="font-display text-affiche-22 leading-tight font-semibold tracking-titre">
        {f.date(objet.scheduled_at, { weekday: 'long', day: 'numeric', month: 'long', dateStyle: undefined })}
      </p>
      <p className="mt-0.5 font-display text-titre-court font-medium text-muted-foreground tabular-nums">{f.heure(objet.scheduled_at)}</p>
    </>
  ) : (
    <TexteDeCarte>{t('heureAFixer')}</TexteDeCarte>
  );

  return peutConfirmer ? (
    <VisiteAConfirmer objet={objet} conversationId={conversationId} quoi={t('quoi', { titre })} etat={etat} ton={ton}>
      {contenu}
    </VisiteAConfirmer>
  ) : (
    <CadreDeCarte type="visite" quoi={t('quoi', { titre })} etat={etat} ton={ton}>
      {contenu}
    </CadreDeCarte>
  );
}

function VisiteAConfirmer({
  objet,
  conversationId,
  quoi,
  etat,
  ton,
  children,
}: {
  readonly objet: ProjectionVisite;
  readonly conversationId: number;
  readonly quoi: string;
  readonly etat: string | undefined;
  readonly ton: TonDeLaCarte;
  readonly children: React.ReactNode;
}) {
  const t = useTranslations('messaging.cartes.visite');
  const erreurDuGeste = useErreurDuGeste();
  const geste = useGesteDeLaCarte(conversationId, clesDeLObjet.visite(objet.id));
  return (
    <CadreDeCarte
      type="visite"
      quoi={quoi}
      etat={etat}
      ton={ton}
      erreur={erreurDuGeste(geste.error)}
      geste={
        <Button
          type="button"
          className={CLASSE_DU_GESTE}
          disabled={geste.isPending}
          aria-busy={geste.isPending || undefined}
          onClick={() => geste.mutate({ chemin: cheminApi`/api/property-visits/${objet.id}/confirm` })}
        >
          {t('confirmer')}
        </Button>
      }
    >
      {children}
    </CadreDeCarte>
  );
}
