'use client';

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
import { useProposeVisitSlot } from '@/lib/queries/visits';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';
import { JOURS_DE_VISITE_OUVERTS, useCreneaux } from '@/lib/visites/useCreneaux';

/*
 * TCK-2587 (lot C) — les dialogues du visiteur et de la fiche, sortis de `VisitDetail` : « Mes
 * visites » (la vue du client) propose un autre créneau et annule depuis sa carte, sans embarquer
 * la fiche entière. Code déplacé tel quel.
 */

/**
 * TCK-590 — le visiteur propose un autre créneau, choisi dans la grille que le serveur rend pour
 * ce bien (créneaux pris inclus, non choisissables). L'heure est construite à Dakar.
 */
export function ProposerUnCreneau({ visitId, slug, onClose }: { visitId: number; slug: string; onClose: () => void }) {
  const t = useTranslations('visitPlanning');
  const tDetail = useTranslations('visits.detail');
  const toast = useToast();
  const propose = useProposeVisitSlot(visitId);
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState<string | null>(null);
  const creneaux = useCreneaux(slug, jour || null);
  // La fenêtre que l'API accepte : du jour UTC à J+60. Hors d'elle, le jour rendait
  // « L'action n'a pas abouti. » (P230.01).
  const [premierJour] = useState(() => jourDeLApi());

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!jour || !heure) return;
    try {
      await propose.mutateAsync({ scheduled_at: instantADakar(jour, heure) });
      toast.add({ title: t('propose.success'), type: 'success' });
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? (err.data as { message?: string } | null)?.message : undefined;
      toast.add({ title: message ?? t('actionError'), type: 'error' });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void valider(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('propose.title')}</DialogTitle>
            <DialogDescription>{t('propose.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`visit-${visitId}-propose-date`} className="block text-sm font-medium text-foreground">
              {t('plan.date')}
            </label>
            <Input
              id={`visit-${visitId}-propose-date`}
              type="date"
              min={premierJour}
              max={decalerJour(premierJour, JOURS_DE_VISITE_OUVERTS)}
              value={jour}
              onChange={(e) => {
                setJour(e.target.value);
                setHeure(null);
              }}
            />
          </div>
          {creneaux.etat === 'charge' ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">
                {t('plan.time')} <span className="font-normal text-muted-foreground">({t('plan.dakarTime')})</span>
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {creneaux.creneaux.map((c) => (
                  <Button
                    key={c.label}
                    type="button"
                    variant={heure === c.label ? 'default' : 'outline'}
                    disabled={!c.available}
                    aria-pressed={heure === c.label}
                    onClick={() => setHeure(c.label)}
                    className="h-10 tabular-nums disabled:text-muted-foreground sm:h-8"
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : creneaux.etat === 'erreur' ? (
            <p role="alert" className="text-sm text-destructive">
              {t('actionError')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tDetail('dialogs.dismiss')}
            </Button>
            <Button type="submit" disabled={!jour || !heure || propose.isPending}>
              {t('propose.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type VisitDialogKind = 'cancel' | 'reschedule';

export function VisitActionDialog({
  kind,
  defaultSlot,
  pending,
  onOpenChange,
  onCancel,
  onReschedule,
}: {
  kind: VisitDialogKind | null;
  defaultSlot: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (reason: string) => Promise<void>;
  onReschedule: (slot: string) => Promise<void>;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Une clé par ouverture : le champ repart vide (ou du créneau courant) à chaque fois. */}
        {kind ? (
          <VisitActionForm
            key={kind}
            kind={kind}
            defaultSlot={defaultSlot}
            pending={pending}
            onDismiss={() => onOpenChange(false)}
            onCancel={onCancel}
            onReschedule={onReschedule}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function VisitActionForm({
  kind,
  defaultSlot,
  pending,
  onDismiss,
  onCancel,
  onReschedule,
}: {
  kind: VisitDialogKind;
  defaultSlot: string;
  pending: boolean;
  onDismiss: () => void;
  onCancel: (reason: string) => Promise<void>;
  onReschedule: (slot: string) => Promise<void>;
}) {
  const t = useTranslations('visits.detail');
  const messageErreur = useMessageErreurApi();
  const [value, setValue] = useState(kind === 'reschedule' ? defaultSlot : '');
  // P230.05 — `scheduled_at` `after:now` : le champ se lit à Dakar, son `min` est donc l'instant
  // présent à Dakar (`AAAA-MM-JJTHH:MM`), et non dans le fuseau du navigateur.
  const [maintenantADakar] = useState(() => heureMuraleADakar());
  const [touched, setTouched] = useState(false);
  // P182.01 — l'erreur de l'API se dit dans le dialogue, qui reste ouvert (ADR-0019).
  const [erreurApi, setErreurApi] = useState<string | null>(null);
  const fieldId = `visit-${kind}-field`;
  const errorId = `${fieldId}-error`;
  const trimmed = value.trim();
  const valid =
    kind === 'cancel'
      ? trimmed.length > 0
      : trimmed.length > 0 && !Number.isNaN(new Date(trimmed).getTime());
  const showError = touched && !valid;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    setErreurApi(null);
    try {
      if (kind === 'cancel') await onCancel(trimmed);
      else await onReschedule(trimmed);
    } catch (e) {
      setErreurApi(messageErreur(e));
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t(`dialogs.${kind}.title`)}</DialogTitle>
        <DialogDescription>{t(`dialogs.${kind}.description`)}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {kind === 'cancel' ? t('cancellationReason') : t('dialogs.reschedule.label')}
        </label>
        {kind === 'cancel' ? (
          <Textarea
            id={fieldId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            placeholder={t('dialogs.cancel.placeholder')}
            required
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
        ) : (
          <Input
            id={fieldId}
            type="datetime-local"
            min={maintenantADakar}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            required
            className="tabular-nums"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
        )}
        {showError ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {t(`dialogs.${kind}.required`)}
          </p>
        ) : null}
      </div>
      {erreurApi ? (
        <p role="alert" className="text-sm text-destructive">
          {erreurApi}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          {t('dialogs.dismiss')}
        </Button>
        <Button
          type="submit"
          variant={kind === 'cancel' ? 'destructive' : 'default'}
          disabled={pending}
        >
          {pending ? t('dialogs.processing') : t(`dialogs.${kind}.submit`)}
        </Button>
      </DialogFooter>
    </form>
  );
}
