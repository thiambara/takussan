'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { dureeJusqua, relanceDuBailleur, type Duree, type InterventionEnFile } from '@/lib/maintenance/files';
import { useRemindMaintenanceOwner } from '@/lib/queries/maintenance';
import { cn } from '@/lib/utils';

/**
 * TCK-2786 — « Relancer le bailleur » : le geste principal de la file « Chez le bailleur », sur la
 * carte comme sur la fiche. Un clic relance (`POST …/owner-reminders`) : le bailleur reçoit une
 * notification par Takussan, son contact n'est jamais servi. Après la relance, le geste dit
 * « Relancé il y a … » et reste inactif tant que la suivante n'est pas permise (24 h).
 *
 * Sur la carte, la ligne ne porte pas les `abilities` : l'état se lit sur `owner_reminded_at`, et
 * l'API rejuge tout (409). Sur la fiche, `peut` vient de `abilities.can_remind_owner` : faux sans
 * relance récente (bailleur parti, lecteur sans le droit), le geste ne s'affiche pas.
 *
 * Trois exigences du porteur (2026-11-14) :
 * - la relance réussie se voit ET s'annonce : le geste dit « Relance envoyée » (inactif), et une
 *   région `role="status"`, présente dès le rendu, l'annonce aux lecteurs d'écran ;
 * - un refus de cadence dit le délai restant, tiré d'`available_at` ;
 * - un seul envoi par geste : bouton inactif pendant l'envoi, et un verrou synchrone (`enVol`) pour le
 *   second clic qui arriverait avant que React n'ait rendu l'état « en cours ».
 */
export function RelancerLeBailleur({
  request,
  maintenant,
  taille,
  peut = true,
}: {
  readonly request: Pick<InterventionEnFile, 'id' | 'owner_reminded_at'>;
  readonly maintenant: Date;
  readonly taille: 'telephone' | 'colonne' | 'fiche';
  readonly peut?: boolean;
}) {
  const t = useTranslations('maintenance.relanceDuBailleur');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const relancer = useRemindMaintenanceOwner(request.id);
  const enVol = useRef(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState(false);
  const etat = relanceDuBailleur(request, maintenant);

  if (!envoyee && etat.etat === 'possible' && !peut) return null;

  const inactif = envoyee || etat.etat === 'relance';
  const classes = cn(
    'relative z-10 inline-flex min-w-0 flex-1 items-center justify-center whitespace-nowrap font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none',
    taille === 'colonne' ? 'h-8 rounded-md px-2 text-xs' : 'h-11 rounded-lg px-3 text-sm',
    inactif
      ? 'border border-border bg-muted text-muted-foreground'
      : taille === 'fiche'
        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
        : 'border border-border bg-card text-foreground hover:bg-muted',
  );
  const duree = (d: Duree) => f.nombre(d.n, { style: 'unit', unit: d.unite, unitDisplay: 'short' });

  const quandErreur = (err: unknown) => {
    const corps = err instanceof ApiError && err.data && typeof err.data === 'object' ? (err.data as { code?: unknown; params?: { available_at?: unknown } }) : null;
    const permise = corps?.code === 'maintenance.owner_reminder_too_soon' && typeof corps.params?.available_at === 'string' ? corps.params.available_at : null;
    const reste = permise ? dureeJusqua(permise, new Date()) : null;
    if (permise && reste) {
      setErreur(t('tropTot', { delai: duree(reste), date: f.jourMois(permise, maintenant), heure: f.heure(permise) }));
    } else if (corps?.code === 'maintenance.owner_unavailable') {
      setErreur(t('injoignable'));
    } else {
      setErreur(messageErreur(err, t('echec')));
    }
  };

  const envoyer = () => {
    if (enVol.current) return;
    enVol.current = true;
    setErreur(null);
    relancer.mutate(undefined, {
      onSuccess: () => setEnvoyee(true),
      onError: quandErreur,
      onSettled: () => {
        enVol.current = false;
      },
    });
  };

  return (
    <>
      {envoyee ? (
        <button type="button" disabled data-slot="relance-du-bailleur" data-etat="envoyee" className={classes}>
          {t('envoyee')}
        </button>
      ) : etat.etat === 'relance' ? (
        <button type="button" disabled data-slot="relance-du-bailleur" data-etat="relance" className={classes}>
          {t('relance', { duree: duree(etat.duree) })}
        </button>
      ) : (
        <button
          type="button"
          data-slot="relance-du-bailleur"
          data-etat="possible"
          disabled={relancer.isPending}
          aria-busy={relancer.isPending || undefined}
          className={classes}
          onClick={envoyer}
        >
          {t('relancer')}
        </button>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {envoyee ? t('envoyee') : ''}
      </span>
      {erreur ? (
        <p role="alert" className="relative z-10 basis-full text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </>
  );
}
