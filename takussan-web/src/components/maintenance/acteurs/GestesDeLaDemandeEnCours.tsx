'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock, MessageSquare, Plus } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { CRENEAUX_PROPOSES_MAX, lireLesCreneaux } from '@/lib/maintenance/mes-demandes';
import { useDemanderUnAutreCreneau, useMaintenanceRequest } from '@/lib/queries/maintenance';
import { cn } from '@/lib/utils';
import type { MaintenanceRequest } from '@/types/maintenance';

/** La borne du mot (`StoreMaintenanceRescheduleRequestRequest`, `max:1000`). */
const NOTE_MAX = 1000;

/**
 * TCK-2918 (e5) — les deux gestes de la carte « En cours » du locataire (maquette `app-interventions`
 * a, « Locataire — mes demandes », `CarteEnCours`) : « Écrire à l'agence » et « Changer le créneau ».
 *
 * Tout ce qu'ils lisent n'est servi qu'au DÉTAIL (`conversation_id`, `abilities.can_request_reschedule`,
 * `pending_reschedule_request`) : la carte lit donc la fiche de sa demande. Sans conversation (pas
 * encore assignée), « Écrire à l'agence » n'est pas rendu ; sans `can_request_reschedule`, « Changer le
 * créneau » non plus.
 *
 * « Changer le créneau » envoie une DEMANDE (`POST …/reschedule-requests`, ADR-0118 § 3) : le créneau
 * ne change pas, et la carte dit ensuite que la demande attend la réponse de l'agence.
 */
export function GestesDeLaDemandeEnCours({ id }: { readonly id: number }) {
  const t = useTranslations('maintenance.locataire.demandes.gestes');
  const f = useFormatteurs();
  const fiche = useMaintenanceRequest(id);
  const d = fiche.data?.data ?? null;
  const [ouvert, setOuvert] = useState(false);
  if (!d || d.id !== id) return null;

  const conversation = d.conversation_id ?? null;
  const peutChanger = d.abilities?.can_request_reschedule === true;
  const enAttente = d.pending_reschedule_request ?? null;
  if (conversation === null && !peutChanger && !enAttente) return null;

  return (
    // Au-dessus du lien étiré du titre (`after:absolute after:inset-0`) : sans `relative z-10`, la carte
    // entière capterait les clics des deux gestes.
    <div data-slot="gestes-en-cours" className="relative z-10 mt-4 border-t border-border pt-3">
      {enAttente ? (
        <p data-slot="creneau-demande" className="mb-3 flex gap-2 text-ui leading-snug text-muted-foreground">
          <CalendarClock className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('enAttente', { date: f.jourMois(enAttente.requested_at), n: enAttente.proposed_slots.length })}
        </p>
      ) : null}
      <div className="flex gap-2">
        {conversation !== null ? (
          <Link href={`/app/messages?conversation=${conversation}`} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-w-0 flex-1')}>
            <MessageSquare aria-hidden="true" strokeWidth={1.75} />
            {t('ecrire')}
          </Link>
        ) : null}
        {peutChanger ? (
          <Button type="button" variant="outline" size="lg" className="min-w-0 flex-1" onClick={() => setOuvert(true)}>
            {t('changer')}
          </Button>
        ) : null}
      </div>
      {peutChanger ? <ChangerLeCreneau demande={d} open={ouvert} onOpenChange={setOuvert} /> : null}
    </div>
  );
}

function ChangerLeCreneau({ demande, open, onOpenChange }: { readonly demande: MaintenanceRequest; readonly open: boolean; readonly onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('maintenance.locataire.demandes.gestes.creneau');
  const messageErreur = useMessageErreurApi();
  const envoi = useDemanderUnAutreCreneau(demande.id);
  const [saisis, setSaisis] = useState<string[]>(['']);
  const [note, setNote] = useState('');
  const { instants, passes } = lireLesCreneaux(saisis, new Date());
  const pret = instants.length > 0 && passes === 0 && !envoi.isPending;

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
        <Button type="submit" form={`changer-le-creneau-${demande.id}`} size="lg" className="w-full" disabled={!pret}>
          {t('envoyer')}
        </Button>
      }
    >
      <form
        id={`changer-le-creneau-${demande.id}`}
        data-slot="changer-le-creneau"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pret) return;
          const mot = note.trim();
          envoi.mutate({ proposed_slots: instants, ...(mot ? { note: mot } : {}) }, { onSuccess: () => fermer(false) });
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{t('texte')}</p>
        {saisis.map((v, i) => (
          <div key={i} className="flex flex-col">
            <label htmlFor={`creneau-${demande.id}-${i}`} className="mb-1.5 text-sm font-medium">
              {t('creneauN', { n: i + 1 })}
            </label>
            <DateTimePicker id={`creneau-${demande.id}-${i}`} value={v} onValueChange={(nv) => setSaisis((s) => s.map((x, j) => (j === i ? nv : x)))} />
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
        <label htmlFor={`creneau-note-${demande.id}`} className="block text-sm font-medium">
          {t('note')}
        </label>
        <Textarea id={`creneau-note-${demande.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={2} placeholder={t('exemple')} />
        <p className="text-xs text-muted-foreground">{t('attente')}</p>
        {envoi.error ? (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(envoi.error, t('echec'))}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}
