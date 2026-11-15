'use client';

import { useState } from 'react';
import { Pin } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Textarea } from '@/components/ui/textarea';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';

import type { LectureDuProspect } from './lecture';
import type { MotifEnAttente } from './usePipeline';

/** Les motifs d'une perte (maquette a-2) ; la clé technique est rédigée dans la note épinglée. */
export const MOTIFS_DE_PERTE = ['prix', 'ailleurs', 'financement', 'silence', 'autre'] as const;
type MotifDePerte = (typeof MOTIFS_DE_PERTE)[number];

/** P244.01 (TCK-2361) — la borne de `UpdatePipelineStageCustomerRequest` (`max:5000`). */
const BORNE = 5000;

interface MotifProps {
  readonly motif: MotifEnAttente | null;
  readonly lecture: LectureDuProspect | null;
  readonly onAnnuler: () => void;
  /** Le parent ferme sur le SUCCÈS seulement : un refus garde le motif saisi (P244.01). */
  readonly onEnregistrer: (reason: string) => void;
  readonly erreur?: string | null;
  readonly enCours?: boolean;
}

/**
 * TCK-2592 — le motif d'une sortie (maquette `app-pipeline` a-2) : feuille du bas au téléphone,
 * dialogue de 480 px au bureau. Perdu : un motif parmi cinq, une précision facultative ; Gagné : la
 * précision, requise. Le tout devient une note épinglée sur la fiche (`PATCH …/pipeline-stage`).
 */
export function MotifDuPipeline({ motif, lecture, onAnnuler, onEnregistrer, erreur = null, enCours = false }: MotifProps) {
  const t = useTranslations('crm.pipeline.motif');
  const bureau = useMatchesMedia('(width >= 48rem)');
  const ouvert = motif !== null && lecture !== null;
  const titre = ouvert ? (motif.to === 'lost' ? t('titrePerdu', { prenom: lecture.prenom }) : t('titreGagne', { prenom: lecture.prenom })) : '';
  // Une clé par demande : un motif neuf ne reprend pas la saisie du précédent.
  const corps = ouvert ? <CorpsDuMotif key={`${motif.prospect.id}-${motif.to}`} motif={motif} lecture={lecture} bureau={bureau} onAnnuler={onAnnuler} onEnregistrer={onEnregistrer} erreur={erreur} enCours={enCours} /> : null;

  if (!bureau) {
    return (
      <FeuilleDuBas open={ouvert} onOpenChange={(o) => (o ? null : onAnnuler())} titre={titre}>
        {corps}
      </FeuilleDuBas>
    );
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? null : onAnnuler())}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-panneau">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-lg font-semibold">{titre}</DialogTitle>
        </DialogHeader>
        {corps}
      </DialogContent>
    </Dialog>
  );
}

interface CorpsProps extends Omit<MotifProps, 'motif' | 'lecture'> {
  readonly motif: MotifEnAttente;
  readonly lecture: LectureDuProspect;
  readonly bureau: boolean;
}

function CorpsDuMotif({ motif, lecture, bureau, onAnnuler, onEnregistrer, erreur, enCours }: CorpsProps) {
  const t = useTranslations('crm.pipeline');
  const tM = useTranslations('crm.pipeline.motif');
  const perte = motif.to === 'lost';
  const [choisi, setChoisi] = useState<MotifDePerte | null>(null);
  const [precision, setPrecision] = useState('');
  const texte = precision.trim();
  const pret = perte ? choisi !== null : texte.length > 0;
  const reason = perte && choisi ? [tM(`motifs.${choisi}`), texte].filter(Boolean).join(' — ') : texte;
  const objet = lecture.cherche;

  const enregistrer = (
    <Button type="button" disabled={!pret || enCours} onClick={() => onEnregistrer(reason.slice(0, BORNE))} className={cn(!bureau && 'h-12 w-full rounded-xl text-corps font-semibold')} data-testid="reason-submit">
      {tM('enregistrer')}
    </Button>
  );

  return (
    <>
      <div className={cn('space-y-4', bureau ? 'px-6 py-5' : 'pt-2')}>
        <DialogDescriptionOuTexte bureau={bureau}>
          {[`${t(`stage.${motif.from}`)} → ${t(`stage.${motif.to}`)}`, objet].filter(Boolean).join(' · ')}
        </DialogDescriptionOuTexte>
        {perte ? (
          <div role="group" aria-label={tM('motifsAria')} className="flex flex-wrap gap-2">
            {MOTIFS_DE_PERTE.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={choisi === m}
                onClick={() => setChoisi(choisi === m ? null : m)}
                className={cn(
                  'inline-flex items-center justify-center whitespace-nowrap border px-3.5 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  bureau ? 'h-9 rounded-lg text-sm' : 'h-11 rounded-xl text-corps',
                  choisi === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {tM(`motifs.${m}`)}
              </button>
            ))}
          </div>
        ) : null}
        <div>
          <label htmlFor="motif-precision" className="mb-1.5 block text-sm font-medium">
            {tM('precision')}
            {perte ? <span className="font-normal text-muted-foreground"> · {tM('facultative')}</span> : null}
          </label>
          <Textarea id="motif-precision" value={precision} onChange={(e) => setPrecision(e.target.value)} rows={3} maxLength={BORNE} className="min-h-24" data-testid="reason-input" />
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-ui leading-snug text-muted-foreground">
          <Pin className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
          {tM('note', { prenom: lecture.prenom, etape: t(`stage.${motif.from}`) })}
        </p>
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
        {bureau ? null : <div className="-mx-4 border-t border-border px-4 pt-3">{enregistrer}</div>}
      </div>
      {bureau ? (
        <DialogFooter className="m-0 rounded-b-xl border-t border-border bg-transparent px-6 py-3.5">
          <Button variant="outline" type="button" onClick={onAnnuler}>
            {t('actions.cancel')}
          </Button>
          {enregistrer}
        </DialogFooter>
      ) : null}
    </>
  );
}

function DialogDescriptionOuTexte({ bureau, children }: { readonly bureau: boolean; readonly children: string }) {
  return bureau ? <DialogDescription className="text-sm text-muted-foreground">{children}</DialogDescription> : <p className="text-sm text-muted-foreground">{children}</p>;
}
