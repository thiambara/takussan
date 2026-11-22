'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Textarea } from '@/components/ui/textarea';
import { MOTIF_D_ANNULATION_MAX } from '@/lib/schemas/maintenance';

/**
 * TCK-2918 — « Annuler la demande » demande le motif (ADR-0118 § 1) : `PUT …/status {status: cancelled}`
 * sans `reason` prend 422, et le locataire, le bailleur et le prestataire lisent ce motif
 * (`cancellation_reason`, notifications `…_with_reason`). Confirmer reste impossible tant que le motif
 * est vide (espaces seuls compris : l'API les ramène à vide).
 *
 * Une seule saisie pour les deux fiches qui annulent : celle de l'agence (« Autre action ») et celle
 * des autres rôles (`MaintenanceDetail`, le bailleur compris).
 */
export function MotifDAnnulation({
  open,
  onOpenChange,
  titre,
  enCours,
  onConfirmer,
  erreur,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Le titre de la demande, rappelé dans le texte. */
  readonly titre: string;
  readonly enCours: boolean;
  readonly onConfirmer: (motif: string) => void;
  readonly erreur?: string | null;
}) {
  const t = useTranslations('maintenance.annulation');
  const [motif, setMotif] = useState('');
  const propre = motif.trim();
  const fermer = (o: boolean) => {
    if (!o) setMotif('');
    onOpenChange(o);
  };
  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={t('titre')}
      pied={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => fermer(false)}>
            {t('garder')}
          </Button>
          <Button type="submit" form="motif-d-annulation" variant="destructive" className="flex-1" disabled={enCours || propre === ''}>
            {t('confirmer')}
          </Button>
        </div>
      }
    >
      <form
        id="motif-d-annulation"
        data-slot="motif-d-annulation"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (propre !== '' && !enCours) onConfirmer(propre);
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{t('texte', { titre })}</p>
        <label htmlFor="motif-d-annulation-texte" className="block text-sm font-medium">
          {t('motif')}
        </label>
        <Textarea
          profil="texte-long"
          id="motif-d-annulation-texte"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          maxLength={MOTIF_D_ANNULATION_MAX}
          rows={3}
          required
          placeholder={t('exemple')}
          aria-describedby="motif-d-annulation-aide"
        />
        <p id="motif-d-annulation-aide" className="text-xs text-muted-foreground">
          {t('aide')}
        </p>
        {erreur ? (
          <p role="alert" className="text-xs text-destructive">
            {erreur}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}
