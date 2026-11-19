'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { useErreurDuGeste } from '../cartes/CadreDeCarte';
import { echeanceSaisie, MOTIF_DE_REOUVERTURE_MAX, MOTIF_DE_REOUVERTURE_MIN, TITRE_MAX, type GesteDEngagement } from './engagement';
import { useGesteDEngagement } from './useGesteDEngagement';

interface FeuilleProps {
  readonly conversationId: number;
  readonly engagementId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * TCK-2972 — une nouvelle échéance (et, pour « Modifier », le titre) : `confirm` avec `due_at` sur un
 * engagement à confirmer (« Proposer une autre date » du porteur), `PUT` (`update`) sur un engagement
 * ouvert (« Proposer une autre date » du porteur, « Accorder une nouvelle date » ou « Modifier » du
 * personnel). La date seule vaut la fin du jour, heure de Dakar (`echeanceSaisie`).
 */
export function FeuilleDEcheance({
  conversationId,
  engagementId,
  open,
  onOpenChange,
  geste,
  titre,
  titreActuel,
}: FeuilleProps & {
  readonly geste: Extract<GesteDEngagement, 'confirm' | 'update'>;
  readonly titre: string;
  /** Présent : le titre se modifie aussi (« Modifier »). */
  readonly titreActuel?: string;
}) {
  const t = useTranslations('messaging.engagements.feuille');
  const erreurDuGeste = useErreurDuGeste();
  const envoi = useGesteDEngagement(conversationId);
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');
  const [intitule, setIntitule] = useState(titreActuel ?? '');
  const echeance = date ? echeanceSaisie(date, heure) : null;
  const titreModifie = titreActuel !== undefined && intitule.trim() !== '' && intitule.trim() !== titreActuel;
  const pret = !envoi.isPending && (echeance !== null || titreModifie);
  const formulaire = `echeance-${geste}-${engagementId}`;

  const fermer = (o: boolean) => {
    if (!o) envoi.reset();
    onOpenChange(o);
  };

  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={titre}
      pied={
        <Button type="submit" form={formulaire} size="lg" className="w-full" disabled={!pret}>
          {t('enregistrer')}
        </Button>
      }
    >
      <form
        id={formulaire}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pret) return;
          const corps: Record<string, unknown> = {};
          if (echeance) corps.due_at = echeance;
          if (titreModifie) corps.title = intitule.trim();
          envoi.appeler({ geste, id: engagementId, corps }, { onSuccess: () => fermer(false) });
        }}
      >
        {titreActuel !== undefined ? (
          <div className="flex flex-col">
            <label htmlFor={`${formulaire}-titre`} className="mb-1.5 text-sm font-medium">
              {t('aQuoi')}
            </label>
            <Input id={`${formulaire}-titre`} value={intitule} onChange={(e) => setIntitule(e.target.value)} maxLength={TITRE_MAX} />
          </div>
        ) : null}
        <div className="flex flex-col">
          <label htmlFor={`${formulaire}-date`} className="mb-1.5 text-sm font-medium">
            {t('date')}
          </label>
          <DatePicker id={`${formulaire}-date`} value={date} onValueChange={setDate} />
        </div>
        <div className="flex flex-col">
          <label htmlFor={`${formulaire}-heure`} className="mb-1.5 text-sm font-medium">
            {t('heure')}
          </label>
          <Input id={`${formulaire}-heure`} type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">{t('heureFacultative')}</p>
        </div>
        {envoi.error ? (
          <p role="alert" className="text-xs text-destructive">
            {erreurDuGeste(envoi.error)}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}

/** TCK-2972 — « Ce n'est pas fait » : `POST /api/commitments/{id}/reopen` avec un motif de 3 à 500 caractères. */
export function FeuilleDeReouverture({ conversationId, engagementId, open, onOpenChange }: FeuilleProps) {
  const t = useTranslations('messaging.engagements.reouverture');
  const erreurDuGeste = useErreurDuGeste();
  const envoi = useGesteDEngagement(conversationId);
  const [motif, setMotif] = useState('');
  const pret = motif.trim().length >= MOTIF_DE_REOUVERTURE_MIN && !envoi.isPending;
  const formulaire = `reouverture-${engagementId}`;

  const fermer = (o: boolean) => {
    if (!o) {
      setMotif('');
      envoi.reset();
    }
    onOpenChange(o);
  };

  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={t('titre')}
      pied={
        <Button type="submit" form={formulaire} size="lg" className="w-full" disabled={!pret}>
          {t('envoyer')}
        </Button>
      }
    >
      <form
        id={formulaire}
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pret) return;
          envoi.appeler({ geste: 'reopen', id: engagementId, corps: { reason: motif.trim() } }, { onSuccess: () => fermer(false) });
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{t('texte')}</p>
        <label htmlFor={`${formulaire}-motif`} className="block text-sm font-medium">
          {t('motif')}
        </label>
        <Textarea id={`${formulaire}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={MOTIF_DE_REOUVERTURE_MAX} rows={3} />
        <p className="text-xs text-muted-foreground">{t('aide', { min: MOTIF_DE_REOUVERTURE_MIN })}</p>
        {envoi.error ? (
          <p role="alert" className="text-xs text-destructive">
            {erreurDuGeste(envoi.error)}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}
