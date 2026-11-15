'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useSubmitVisitFeedback } from '@/lib/queries/visits';
import { heuresRestantesPourLAvis } from '@/lib/visites/fenetre-d-avis';
import { cn } from '@/lib/utils';
import type { PropertyVisit } from '@/types/visit';

import { CARTE } from '../par-le-temps/pieces';
import { useQuandRelatif } from '../par-le-temps/cartes';

const NOTES = [1, 2, 3, 4, 5] as const;

/** Des étoiles pleines jusqu'à la note : la lecture d'un avis déjà donné (« Passées »). */
export function Etoiles({ note, className }: { readonly note: number; readonly className?: string }) {
  const t = useTranslations('visits.client.avis');
  return (
    <span role="img" aria-label={t('noteDonnee', { n: note })} className={cn('inline-flex items-center gap-0.5', className)}>
      {NOTES.map((i) => (
        <Star
          key={i}
          className={cn('size-3.5', i <= Math.round(note) ? 'fill-primary text-primary' : 'text-muted-foreground')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * TCK-2587 (lot C, AC6) — « Votre avis » : la visite terminée depuis moins de 24 h que le client n'a
 * pas notée (maquette a-7). La note de 1 à 5, un mot facultatif, ce qu'il reste de la fenêtre ; le
 * serveur rejuge la fenêtre (422 `visit.feedback_window_closed`) et le rôle (403). Une fois l'avis
 * donné, la liste relue n'a plus de visite à noter : la carte s'en va d'elle-même.
 */
export function AvisDuClient({ v, maintenant }: { readonly v: PropertyVisit; readonly maintenant: Date }) {
  const t = useTranslations('visits.client.avis');
  const tVisits = useTranslations('visits');
  const quand = useQuandRelatif();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const envoi = useSubmitVisitFeedback(v.id);
  const [note, setNote] = useState<number | null>(null);
  const [mot, setMot] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const heures = heuresRestantesPourLAvis(v, maintenant.getTime());
  const titre = v.property?.title?.trim() || tVisits('fallbackTitle', { id: String(v.id) });
  // « Visité hier à 16:00 » : l'heure de la visite, la clôture à défaut.
  const instant = v.scheduled_at ?? v.completed_at;
  const moment = instant ? quand(instant, maintenant) : null;
  const agent = v.agent?.first_name?.trim() || null;
  const idQuestion = `avis-${v.id}-question`;

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (note === null) return;
    setErreur(null);
    try {
      await envoi.mutateAsync({ role: 'customer', rating: note, comment: mot.trim() || undefined });
      toast.add({ title: t('merci'), type: 'success' });
    } catch (err) {
      setErreur(messageErreur(err, t('erreur')));
    }
  }

  return (
    <article data-slot="avis-du-client" className={cn(CARTE, 'p-4')}>
      <div className="flex items-center gap-3">
        <Vignette src={v.property?.cover_url} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-corps font-semibold text-foreground">{titre}</p>
          {moment ? (
            <p className="text-sm text-muted-foreground">
              {agent ? t('visiteAvec', { quand: moment, agent }) : t('visite', { quand: moment })}
            </p>
          ) : null}
        </div>
      </div>

      <form onSubmit={(e) => void envoyer(e)} className="mt-4">
        <fieldset aria-describedby={note !== null ? `${idQuestion}-libelle` : undefined}>
          <legend id={idQuestion} className="w-full text-corps font-medium text-foreground">
            {t('question')}
          </legend>
          <div className="mt-2 flex items-center justify-between gap-3">
            {/* Des cibles de 44 px, l'étoile de 36 au même pas que la maquette (`-m-1` rend le débord). */}
            <div className="-m-1 flex">
              {NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNote(n)}
                  aria-pressed={note === n}
                  aria-label={t('etoiles', { n })}
                  data-slot="etoile"
                  className="inline-flex size-11 items-center justify-center rounded-full outline-none transition-[scale] duration-150 focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96]"
                >
                  <Star
                    className={cn('size-9', note !== null && n <= note ? 'fill-primary text-primary' : 'text-muted-foreground')}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
            <span id={`${idQuestion}-libelle`} aria-live="polite" className="text-sm text-muted-foreground">
              {note !== null ? t(`notes.${note}`) : null}
            </span>
          </div>
        </fieldset>

        <Textarea
          rows={2}
          value={mot}
          onChange={(e) => setMot(e.target.value)}
          // La borne de l'API (`FeedbackPropertyVisitRequest`, max:2000), comme la fiche.
          maxLength={2000}
          aria-label={t('placeholder')}
          placeholder={t('placeholder')}
          className="mt-3 min-h-16 lg:min-h-[calc(var(--spacing)*17.75)]"
        />

        {erreur ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {erreur}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" size="lg" disabled={note === null || envoi.isPending} className="flex-1 px-3.5">
            {envoi.isPending ? t('envoi') : t('envoyer')}
          </Button>
          {heures !== null ? <span className="text-ui text-muted-foreground tabular-nums">{t('reste', { heures })}</span> : null}
        </div>
      </form>
    </article>
  );
}
