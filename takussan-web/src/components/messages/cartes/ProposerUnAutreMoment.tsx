'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Textarea } from '@/components/ui/textarea';
import { CRENEAUX_PROPOSES_MAX, lireLesCreneaux } from '@/lib/maintenance/mes-demandes';
import { cheminApi } from '@/lib/chemin-api';

import { useErreurDuGeste } from './CadreDeCarte';
import { clesDeLObjet, useGesteDeLaCarte } from './useGesteDeLaCarte';

/** `StoreMaintenanceRescheduleRequestRequest` : `note` ≤ 1000. */
const NOTE_MAX = 1000;

/**
 * TCK-2962 — « Proposer un autre moment » depuis la carte de passage : la même demande que « Changer le
 * créneau » de la fiche du demandeur (`POST /api/maintenance-requests/{id}/reschedule-requests`, TCK-2917),
 * sans quitter le fil. Ses textes vivent sous `messaging` : le fil est atteint depuis la racine (le widget),
 * et l'espace `maintenance` n'y est pas servi (`check-i18n-namespaces`). Le passage prévu ne change pas : l'agence répond. Le fil se relit
 * au succès comme à l'échec.
 */
export function ProposerUnAutreMoment({
  conversationId,
  interventionId,
  open,
  onOpenChange,
}: {
  readonly conversationId: number;
  readonly interventionId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('messaging.cartes.creneau');
  const erreurDuGeste = useErreurDuGeste();
  const envoi = useGesteDeLaCarte(conversationId, clesDeLObjet.intervention());
  const [saisis, setSaisis] = useState<string[]>(['']);
  const [note, setNote] = useState('');
  const { instants, passes } = lireLesCreneaux(saisis, new Date());
  const pret = instants.length > 0 && passes === 0 && !envoi.isPending;
  const formulaire = `proposer-un-autre-moment-${interventionId}`;

  const fermer = (o: boolean) => {
    if (!o) {
      setSaisis(['']);
      setNote('');
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
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pret) return;
          const mot = note.trim();
          envoi.mutate(
            {
              chemin: cheminApi`/api/maintenance-requests/${interventionId}/reschedule-requests`,
              corps: { proposed_slots: instants, ...(mot ? { note: mot } : {}) },
            },
            { onSuccess: () => fermer(false) },
          );
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{t('texte')}</p>
        {saisis.map((v, i) => (
          <div key={i} className="flex flex-col">
            <label htmlFor={`${formulaire}-${i}`} className="mb-1.5 text-sm font-medium">
              {t('creneauN', { n: i + 1 })}
            </label>
            <DateTimePicker id={`${formulaire}-${i}`} value={v} onValueChange={(nv) => setSaisis((s) => s.map((x, j) => (j === i ? nv : x)))} />
          </div>
        ))}
        {saisis.length < CRENEAUX_PROPOSES_MAX ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSaisis((s) => [...s, ''])}>
            <Plus aria-hidden="true" />
            {t('ajouter')}
          </Button>
        ) : null}
        {passes > 0 ? (
          <p role="alert" className="text-xs text-destructive">
            {t('passe')}
          </p>
        ) : null}
        <label htmlFor={`${formulaire}-note`} className="block text-sm font-medium">
          {t('note')}
        </label>
        <Textarea id={`${formulaire}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={2} placeholder={t('exemple')} />
        <p className="text-xs text-muted-foreground">{t('attente')}</p>
        {envoi.error ? (
          <p role="alert" className="text-xs text-destructive">
            {erreurDuGeste(envoi.error)}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}
