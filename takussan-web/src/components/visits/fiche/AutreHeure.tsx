'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PastilleDeChoix } from '@/components/visits/planification/PiecesDeLaPlanification';
import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
import { useCreneauxDeVisite } from '@/lib/queries/visits';
import { DELAI_DE_PREVENANCE_MINUTES, jourEnClair } from '@/lib/visites/planification';
import { JOURS_DE_VISITE_OUVERTS } from '@/lib/visites/useCreneaux';

/**
 * TCK-2587, lot B — « Autre… » (et `?heure=autre`, posé par la carte d'une demande) : le jour, puis
 * une heure libre de ce jour (`GET /api/property-visits/slots`) ; « Confirmer à 15:00 » poste la
 * confirmation avec `scheduled_at`. Les créneaux pris restent affichés, barrés.
 */
export function AutreHeure({
  propertyId,
  agentId,
  jourInitial,
  enCours,
  erreur,
  onConfirmer,
  onFermer,
}: {
  readonly propertyId: number;
  /** L'agent de la visite : ses créneaux, pas ceux de l'appelant (d1). `null` : l'appelant. */
  readonly agentId: number | null;
  /** Le jour de la demande (`AAAA-MM-JJ` à Dakar), choisi d'emblée s'il est encore ouvert. */
  readonly jourInitial: string | null;
  readonly enCours: boolean;
  readonly erreur: string | null;
  readonly onConfirmer: (scheduledAt: string) => void;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('visits.fiche.autreHeure');
  const locale = useLocale();
  const [premierJour] = useState(() => jourDeLApi());
  const dernierJour = decalerJour(premierJour, JOURS_DE_VISITE_OUVERTS);
  const [jour, setJour] = useState(() => (jourInitial && jourInitial >= premierJour && jourInitial <= dernierJour ? jourInitial : ''));
  const [choisi, setChoisi] = useState<{ readonly start: string; readonly label: string } | null>(null);
  const creneaux = useCreneauxDeVisite(jour ? propertyId : null, jour || null, agentId);
  // L'instant de la lecture tient lieu de « maintenant » : le rendu reste pur.
  const auPlusTot = creneaux.dataUpdatedAt + DELAI_DE_PREVENANCE_MINUTES * 60_000;
  const liste = (creneaux.data?.data.slots ?? []).map((c) => ({ ...c, libre: c.available && Date.parse(c.start) >= auPlusTot }));

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <DialogContent className="sm:max-w-md" data-slot="autre-heure">
        <DialogHeader>
          <DialogTitle>{t('titre')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={`autre-heure-${propertyId}-jour`} className="block text-sm font-medium text-foreground">
            {t('jour')}
          </label>
          <Input
            id={`autre-heure-${propertyId}-jour`}
            type="date"
            min={premierJour}
            max={dernierJour}
            value={jour}
            onChange={(e) => {
              setJour(e.target.value);
              setChoisi(null);
            }}
          />
          {jour ? <p className="text-ui text-muted-foreground">{jourEnClair(jour, locale)}</p> : null}
        </div>
        {jour && creneaux.data ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">{t('heure')}</legend>
            {liste.some((c) => c.libre) ? (
              <div className="flex flex-wrap gap-2">
                {liste.map((c) => (
                  <PastilleDeChoix key={c.start} actif={choisi?.start === c.start} pris={!c.libre} onChoisir={() => setChoisi({ start: c.start, label: c.label })}>
                    {c.label}
                  </PastilleDeChoix>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('aucune')}</p>
            )}
          </fieldset>
        ) : null}
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onFermer}>
            {t('fermer')}
          </Button>
          <Button type="button" disabled={!choisi || enCours} onClick={() => choisi && onConfirmer(choisi.start)} className="tabular-nums">
            {choisi ? t('confirmer', { heure: choisi.label }) : t('titre')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
