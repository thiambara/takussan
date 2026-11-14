'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { FeuilleOuPanneau, PastillesDeChoix, useEnPanneau } from './pieces-des-feuilles';

export type ActionDeDecision = 'confirm' | 'reject' | 'cancel';
type Nature = 'stay' | 'application' | 'offer' | 'autre';

/**
 * Les motifs d'un refus, par nature (maquette « Refuser (motif) » pour la candidature). « Autre »
 * demande la précision. La clé technique n'est jamais envoyée : le motif part en mots, dans
 * `reason`, suivi de la précision (comme la sortie du pipeline, TCK-2592).
 */
export const MOTIFS_DE_REFUS: Readonly<Record<Nature, readonly string[]>> = {
  application: ['dossierIncomplet', 'revenusInsuffisants', 'bienAttribue', 'autre'],
  offer: ['offreTropBasse', 'bienVendu', 'autre'],
  stay: ['datesIndisponibles', 'bienIndisponible', 'autre'],
  autre: [],
};

/** Une borne prudente pour le motif (l'API n'en pose pas : `nullable|string`). */
const BORNE = 2000;

interface FeuilleDeDecisionProps {
  readonly action: ActionDeDecision | null;
  readonly nature: Nature;
  /** Le prénom du client : « Refuser et prévenir Ousmane ». */
  readonly prenom: string;
  readonly pending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (reason?: string) => Promise<void>;
}

interface Saisie {
  readonly action: ActionDeDecision | null;
  readonly motif: string | null;
  readonly precision: string;
  readonly erreur: string | null;
}

/**
 * TCK-2594 — accepter, refuser ou annuler une réservation, dans la feuille du bas au téléphone et le
 * panneau droit dès `xl` (maquette `app-reservations` a, « Refuser (motif) »). Le refus se motive
 * en pastilles, plus une précision ; l'annulation demande son motif en toutes lettres ; l'acceptation
 * n'a rien à saisir (l'API n'en lit rien) et se confirme d'un geste. Le geste est au pied, collant.
 *
 * P182.01 — l'erreur de l'API se dit dans la feuille, qui reste ouverte (ADR-0019).
 */
export function FeuilleDeDecision({ action, nature, prenom, pending, onOpenChange, onSubmit }: FeuilleDeDecisionProps) {
  const t = useTranslations('bookings.detail');
  const tF = useTranslations('bookings.feuilles.decision');
  const messageErreur = useMessageErreurApi();
  const panneau = useEnPanneau();
  const id = useId();
  const [saisie, setSaisie] = useState<Saisie>({ action, motif: null, precision: '', erreur: null });
  // Un geste neuf repart d'une saisie vide : un refus ouvert après une annulation ne reprend rien.
  if (saisie.action !== action) setSaisie({ action, motif: null, precision: '', erreur: null });
  const { motif, precision, erreur } = saisie.action === action ? saisie : { motif: null, precision: '', erreur: null };
  const poser = (suite: Partial<Saisie>) => setSaisie((avant) => ({ ...avant, ...suite }));

  const refus = action === 'reject';
  const motifs = MOTIFS_DE_REFUS[nature];
  /** Un refus en pastilles (candidature, offre, séjour) ; sans nature connue, le motif s'écrit. */
  const enPastilles = refus && motifs.length > 0;
  const texte = precision.trim();
  const pret =
    action === 'confirm' ? true : enPastilles ? motif !== null && (motif !== 'autre' || texte.length > 0) : texte.length > 0;
  const reason = enPastilles && motif && motif !== 'autre' ? [tF(`refuser.motifs.${motif}`), texte].filter(Boolean).join(' — ') : texte;

  async function envoyer() {
    if (!action || !pret) return;
    poser({ erreur: null });
    try {
      await onSubmit(action === 'confirm' ? undefined : reason.slice(0, BORNE) || undefined);
    } catch (e) {
      poser({ erreur: messageErreur(e) });
    }
  }

  const titre = refus ? tF('refuser.titre', { nature }) : action ? t(`decision.${action}.title`) : '';
  const pied = action ? (
    <Button
      type="submit"
      form={id}
      variant={action === 'confirm' ? 'default' : 'destructive'}
      size={panneau ? 'default' : 'xl'}
      className={panneau ? undefined : 'w-full'}
      disabled={pending || !pret}
    >
      {pending ? t('decision.processing') : refus ? tF('refuser.envoyer', { prenom }) : t(`decision.${action}.submit`)}
    </Button>
  ) : null;

  return (
    <FeuilleOuPanneau open={action !== null} onOpenChange={onOpenChange} titre={titre} pied={pied}>
      {action ? (
        <form
          id={id}
          onSubmit={(e) => {
            e.preventDefault();
            void envoyer();
          }}
          className="space-y-4 pt-1"
        >
          {refus ? null : <p className="text-sm text-muted-foreground">{t(`decision.${action}.description`)}</p>}
          {enPastilles ? (
            <PastillesDeChoix
              libelle={tF('refuser.motif')}
              options={motifs.map((m) => ({ valeur: m, libelle: tF(`refuser.motifs.${m}`) }))}
              valeur={motif}
              onChange={(m) => poser({ motif: m })}
            />
          ) : null}
          {action !== 'confirm' ? (
            <div>
              <label htmlFor={`${id}-precision`} className="mb-1.5 block text-sm font-medium">
                {enPastilles ? tF('refuser.precision') : t(`decision.${action}.label`)}
              </label>
              <Textarea
                id={`${id}-precision`}
                value={precision}
                onChange={(e) => poser({ precision: e.target.value })}
                rows={3}
                maxLength={BORNE}
                placeholder={enPastilles ? undefined : t(`decision.${action}.placeholder`)}
                className="min-h-19"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {enPastilles ? tF('refuser.aide', { prenom }) : texte.length === 0 ? t('decision.reasonRequired') : null}
              </p>
            </div>
          ) : null}
          {erreur ? (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          ) : null}
        </form>
      ) : null}
    </FeuilleOuPanneau>
  );
}
