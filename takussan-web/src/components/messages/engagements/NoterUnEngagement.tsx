'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { useApiMutation } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { messagesInfiniteQueryKey, nouveauxMessagesQueryKey } from '@/lib/queries/conversations-cles';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/message';

import { useErreurDuGeste } from '../cartes/CadreDeCarte';
import { echeanceSaisie, TITRE_MAX } from './engagement';
import { engagementsDuFilQueryKey } from './useGesteDEngagement';

export interface ParticipantDuFil {
  readonly id: number;
  readonly nom: string;
}

interface NoterUnEngagementProps {
  readonly conversationId: number;
  /** Le message d'où l'engagement est noté : cité en tête, son auteur est le porteur proposé. */
  readonly message: Message;
  /** Les participants actifs du fil, soi compris. */
  readonly participants: readonly ParticipantDuFil[];
  readonly moi: number;
  /**
   * Le personnel de l'agence note pour tout participant ; tout autre participant ne note que sa propre
   * promesse (ADR-0130 § 2) : pour lui, le porteur est soi, sans choix. L'API reste juge
   * (`commitment.not_yours`).
   */
  readonly duPersonnel: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * TCK-2978 — une promesse repérée par l'assistant pré-remplit le formulaire (porteur, libellé, échéance ISO).
   * Rien n'est créé sans « Noter » : la route reste celle du lot 3.
   */
  readonly prerempli?: { readonly holder_id: number; readonly title: string; readonly due_at: string | null };
  /** TCK-2978 — appelé au succès de la création, avec le corps envoyé (la décision de la suggestion s'en déduit). */
  readonly onCree?: (corps: Readonly<Record<string, unknown>>) => void;
}

const AGENCE = 'agence';

/**
 * TCK-2972 (ADR-0130 § 2) — « Noter un engagement » depuis un message : `POST
 * /api/conversations/{id}/commitments` `{source_message_id, holder_id, beneficiary_id?, title, due_at}`.
 * Prérempli : le message source cité en tête, le porteur est son auteur (le personnel peut en choisir un
 * autre). L'objet est celui du fil, posé par le serveur : il n'est jamais envoyé. L'échéance se saisit en
 * date, l'heure est facultative (date seule : fin du jour, heure de Dakar). « Envers » est facultatif :
 * un participant, ou l'agence.
 *
 * `FeuilleDuBas` : une feuille au téléphone, le panneau de droite dès `md`, sans rétrécir le fil.
 */
export function NoterUnEngagement({ conversationId, message, participants, moi, duPersonnel, open, onOpenChange, prerempli, onCree }: NoterUnEngagementProps) {
  const t = useTranslations('messaging.engagements.noter');
  const f = useFormatteurs();
  const erreurDuGeste = useErreurDuGeste();
  const auteur = message.sender_id ?? null;
  const porteurParDefaut = duPersonnel && auteur !== null && participants.some((p) => p.id === auteur) ? auteur : moi;
  // TCK-2978 — le porteur pré-rempli n'est retenu que s'il est proposable à ce lecteur.
  const porteurPrerempli = prerempli && (duPersonnel ? participants.some((p) => p.id === prerempli.holder_id) : prerempli.holder_id === moi) ? prerempli.holder_id : null;
  const [porteur, setPorteur] = useState<number>(porteurPrerempli ?? porteurParDefaut);
  const [envers, setEnvers] = useState<number | typeof AGENCE>(AGENCE);
  const [titre, setTitre] = useState(prerempli?.title.slice(0, TITRE_MAX) ?? '');
  // TCK-2978 — l'échéance ISO de la promesse, lue à l'heure de Dakar (UTC+0) : `YYYY-MM-DD` et `HH:MM`.
  const [date, setDate] = useState(prerempli?.due_at?.slice(0, 10) ?? '');
  const [heure, setHeure] = useState(prerempli?.due_at && prerempli.due_at.length >= 16 ? prerempli.due_at.slice(11, 16) : '');
  const echeance = date ? echeanceSaisie(date, heure) : null;
  const porteurs = duPersonnel ? participants : participants.filter((p) => p.id === moi);
  const beneficiaires = participants.filter((p) => p.id !== porteur);

  const envoi = useApiMutation<unknown, Record<string, unknown>>(
    { path: cheminApi`/api/conversations/${conversationId}/commitments`, method: 'POST' },
    {
      idempotence: true,
      invalidate: [messagesInfiniteQueryKey(conversationId), nouveauxMessagesQueryKey(conversationId), [...engagementsDuFilQueryKey(conversationId)]],
    },
  );
  const pret = titre.trim() !== '' && echeance !== null && !envoi.isPending;
  const formulaire = `noter-un-engagement-${message.id}`;

  const fermer = (o: boolean) => {
    if (!o) envoi.reset();
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
        data-testid="noter-un-engagement"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pret) return;
          const corps = {
            source_message_id: message.id,
            holder_id: porteur,
            ...(envers === AGENCE ? {} : { beneficiary_id: envers }),
            title: titre.trim(),
            due_at: echeance,
          };
          envoi.mutate(corps, {
            onSuccess: () => {
              onCree?.(corps); // TCK-2978
              fermer(false);
            },
          });
        }}
      >
        <figure data-testid="message-source" className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-ui leading-snug">
          <figcaption className="text-xs font-medium text-muted-foreground">
            {t('depuis', { nom: message.sender?.full_name ?? '—', heure: f.heure(message.created_at) })}
          </figcaption>
          <blockquote className="mt-0.5 line-clamp-3 italic">{message.content}</blockquote>
        </figure>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('porteur')}</legend>
          <Choix
            nom={`${formulaire}-porteur`}
            options={porteurs.map((p) => ({ valeur: p.id, libelle: p.id === moi ? t('moi') : p.nom }))}
            valeur={porteur}
            onChange={(v) => {
              setPorteur(v as number);
              if (envers === v) setEnvers(AGENCE);
            }}
          />
        </fieldset>

        <div className="flex flex-col">
          <label htmlFor={`${formulaire}-titre`} className="mb-1.5 text-sm font-medium">
            {t('aQuoi')}
          </label>
          <Input id={`${formulaire}-titre`} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={TITRE_MAX} placeholder={t('exemple')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t('heureFacultative')}</p>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('envers')}</legend>
          <Choix
            nom={`${formulaire}-envers`}
            options={[{ valeur: AGENCE, libelle: t('lAgence') }, ...beneficiaires.map((p) => ({ valeur: p.id, libelle: p.id === moi ? t('moi') : p.nom }))]}
            valeur={envers}
            onChange={(v) => setEnvers(v as number | typeof AGENCE)}
          />
        </fieldset>

        <p className="text-xs text-muted-foreground">{t('rattache')}</p>

        {envoi.error ? (
          <p role="alert" className="text-xs text-destructive">
            {erreurDuGeste(envoi.error)}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}

function Choix({
  nom,
  options,
  valeur,
  onChange,
}: {
  readonly nom: string;
  readonly options: readonly { readonly valeur: number | string; readonly libelle: string }[];
  readonly valeur: number | string;
  readonly onChange: (v: number | string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.valeur}
          className={cn(
            'inline-flex min-h-10 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring',
            valeur === o.valeur ? 'bg-foreground text-background' : 'bg-muted text-foreground',
          )}
        >
          <input type="radio" name={nom} value={String(o.valeur)} checked={valeur === o.valeur} onChange={() => onChange(o.valeur)} className="sr-only" />
          {o.libelle}
        </label>
      ))}
    </div>
  );
}
