'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RADAR_OUTREACH_OUTCOMES, RADAR_REASON_MAX, type RadarConsent, type RadarOutcomeRequest, type RadarOutreachOutcome } from '@/types/radar';
import { DISCORDANCES_RADAR } from '../codes-radar';
import { discordancesDe, ecartsDeLErreur, issueProposee } from './reponses';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';
import { useMessageEchecAnnonceur } from './useMessageEchecAnnonceur';

interface DialogueIssueProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** La réponse que l'API jugera : la plus récente du message, ou `null` si aucune n'est déposée. */
  readonly reponse: RadarConsent | null;
  /** Rend la promesse de l'API ; un refus la fait échouer, le dialogue le dit et reste ouvert. */
  readonly onConfirmer: (demande: RadarOutcomeRequest) => Promise<unknown>;
}

const CODE_MOTIF_EXIGE = 'radar.consent.reason_required';

/**
 * TCK-2388 — saisir l'issue d'un message : le seul geste qui CONFIRME une réponse. Prérempli par le classement de l'IA
 * (`ambiguous` ne propose rien). Trois garde-fous, tous doublés côté API :
 * - « accord » n'existe que pour une réponse déposée ;
 * - un accord que le verdict ne soutient pas (écarts listés, ou aucun verdict) exige un motif écrit ;
 * - STOP est définitif : un second geste explicite le confirme.
 */
export function DialogueIssue({ open, onOpenChange, reponse, onConfirmer }: DialogueIssueProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.outcome');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="text-pretty">{t('description')}</DialogDescription>
        </DialogHeader>
        {/* Le contenu se monte à l'ouverture : l'état (issue prérempliée, motif, étape STOP) repart à neuf. */}
        <FormulaireIssue reponse={reponse} onConfirmer={onConfirmer} onAnnuler={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface FormulaireIssueProps {
  readonly reponse: RadarConsent | null;
  readonly onConfirmer: (demande: RadarOutcomeRequest) => Promise<unknown>;
  readonly onAnnuler: () => void;
}

function FormulaireIssue({ reponse, onConfirmer, onAnnuler }: FormulaireIssueProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.outcome');
  const messageEchec = useMessageEchecAnnonceur();
  const nom = useId();
  const champMotif = useId();
  const refMotif = useRef<HTMLTextAreaElement>(null);

  const [issue, setIssue] = useState<RadarOutreachOutcome | null>(() => issueProposee(reponse));
  const [motif, setMotif] = useState('');
  const [etapeStop, setEtapeStop] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  /** Les écarts que l'API a donnés avec son 422 « motif exigé » : `null` tant qu'elle n'a rien exigé. */
  const [ecartsServeur, setEcartsServeur] = useState<string[] | null>(null);

  const serveurExigeMotif = ecartsServeur !== null;
  // Ce que l'écran voit d'abord ; si l'API en voit davantage (un 422), c'est elle qu'on liste.
  const ecartsLocaux = discordancesDe(reponse);
  const ecarts = ecartsLocaux.length > 0 ? ecartsLocaux : (ecartsServeur ?? []);
  const motifExige = issue === 'consented' && (ecarts.length > 0 || serveurExigeMotif);
  const motifManquant = motifExige && motif.trim() === '';
  const sansReponse = reponse === null;

  // Un 422 « motif exigé » ramène le regard sur le champ à remplir.
  useEffect(() => {
    if (serveurExigeMotif) refMotif.current?.focus();
  }, [serveurExigeMotif]);

  const envoyer = async () => {
    if (issue === null) return;
    setEnCours(true);
    setErreur(null);
    try {
      const raison = motif.trim();
      await onConfirmer({ outcome: issue, ...(issue === 'consented' && raison !== '' ? { reason: raison } : {}) });
    } catch (e) {
      setErreur(e);
      setEtapeStop(false);
      if (codeDeLErreur(e) === CODE_MOTIF_EXIGE) setEcartsServeur(ecartsDeLErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  const valider = () => {
    if (issue === 'stop' && !etapeStop) {
      setEtapeStop(true);
      return;
    }
    void envoyer();
  };

  if (etapeStop) {
    return (
      <>
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-issue-stop">
          {t('stopWarning')}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={enCours} onClick={() => setEtapeStop(false)}>{t('back')}</Button>
          <Button type="button" variant="destructive" disabled={enCours} onClick={valider}>
            {enCours ? t('saving') : t('stopConfirm')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <fieldset className="space-y-2" disabled={enCours}>
        <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('legend')}</legend>
        {RADAR_OUTREACH_OUTCOMES.map((code) => {
          const ferme = code === 'consented' && sansReponse;
          return (
            <label
              key={code}
              className={cn(
                'grid cursor-pointer grid-cols-[auto_1fr] gap-x-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              )}
            >
              <input
                type="radio"
                name={nom}
                value={code}
                checked={issue === code}
                disabled={ferme}
                onChange={() => setIssue(code)}
                className="row-span-2 mt-1 accent-primary"
              />
              <span className="font-medium text-foreground">{t(`options.${code}`)}</span>
              <span className="text-xs text-muted-foreground">{ferme ? t('noReply') : t(`hints.${code}`)}</span>
            </label>
          );
        })}
      </fieldset>

      {issue === 'consented' && ecarts.length > 0 ? (
        <div className="rounded-lg border border-warning/60 bg-warning/5 p-3" data-testid="radar-issue-ecarts">
          <p className="text-sm font-medium text-foreground">{t('discordancesHeading')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {ecarts.map((code) => (
              <li key={code}>{DISCORDANCES_RADAR[code] ? t(`discordances.${DISCORDANCES_RADAR[code]}`) : code}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {motifExige ? (
        <div className="space-y-1.5">
          <Label htmlFor={champMotif}>{t('reasonRequiredLabel')}</Label>
          <Textarea
            id={champMotif}
            ref={refMotif}
            value={motif}
            onChange={(event) => setMotif(event.target.value)}
            maxLength={RADAR_REASON_MAX}
            required
            aria-invalid={serveurExigeMotif && motif.trim() === ''}
          />
          <p className="text-xs text-muted-foreground">{t('reasonRequiredHint')}</p>
        </div>
      ) : null}

      {erreur ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-issue-erreur">
          {messageEchec(erreur)}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={enCours} onClick={onAnnuler}>{t('cancel')}</Button>
        <Button
          type="button"
          disabled={enCours || issue === null || motifManquant || (issue === 'consented' && sansReponse)}
          onClick={valider}
        >
          {enCours ? t('saving') : t('confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
