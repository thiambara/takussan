'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { DecisionDuDevis } from '@/components/maintenance/acteurs/DecisionDuDevis';
import { buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useToast } from '@/components/ui/toast';
import type { InterventionEnFile } from '@/lib/maintenance/files';

/**
 * TCK-2624 (lot 2, AC5) — « Valider » un devis depuis l'accueil du bailleur : la feuille du bas au
 * téléphone, le panneau de droite au bureau (`FeuilleDuBas`).
 *
 * La décision n'est pas refaite ici : la feuille monte `DecisionDuDevis`, celle de l'écran
 * « Interventions » du bailleur (TCK-2654) — même fiche, même mutation, donc même cache et même
 * invalidation (`maintenanceKeys.all`) ; même rappel du plafond (`RappelDuSeuil`) ; mêmes gestes
 * « Approuver {montant} » et « Refuser » (motif), seulement sous `abilities.can_decide_quote`.
 * L'accueil n'ajoute que ce qui lui revient : fermer la feuille, le dire, et retirer « Valider »
 * quand l'API refuse le geste (403).
 */
export function FeuilleDuDevis({
  devis,
  onFermer,
  onRefuse,
}: {
  readonly devis: InterventionEnFile;
  readonly onFermer: () => void;
  /** L'API refuse le geste (403) : l'accueil le retire. */
  readonly onRefuse: () => void;
}) {
  const t = useTranslations('accueil.bailleur.feuilleDuDevis');
  const toast = useToast();
  const bien = devis.property?.title ?? null;

  return (
    <FeuilleDuBas
      open
      onOpenChange={(ouverte) => {
        if (!ouverte) onFermer();
      }}
      titre={t('titre')}
      pied={
        <Link href={`/app/maintenance/${devis.id}`} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full md:w-auto' })}>
          {t('voir')}
        </Link>
      }
    >
      <p className="text-corps font-semibold">{devis.title}</p>
      {bien ? <p className="mt-0.5 text-sm text-muted-foreground">{bien}</p> : null}
      <div className="mt-4">
        <DecisionDuDevis
          ligne={devis}
          onApprouve={() => {
            toast.add({ title: t('valide', { intervention: devis.title }), type: 'success' });
            onFermer();
          }}
          onRefuse={() => {
            toast.add({ title: t('refuse'), type: 'error' });
            onRefuse();
          }}
          onRejete={onFermer}
        />
      </div>
    </FeuilleDuBas>
  );
}
