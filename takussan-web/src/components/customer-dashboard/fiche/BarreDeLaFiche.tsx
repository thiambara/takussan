'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import type { CustomerDetail } from '@/types/customer';

/**
 * TCK-2589 (lot C) — la barre collante du bas de la fiche, au téléphone (maquette : « + Note ·
 * + Tâche · Visite »). « Note » et « Tâche » ouvrent la saisie du fil dans ce mode ; « Visite »
 * ouvre la feuille de planification, au seul personnel actif (la règle de `PlanifierUneVisite`).
 * Rendue sous `md` seulement (`BarreDAction`) : au bureau, la saisie est en tête du fil.
 */
export function BarreDeLaFiche({
  customer,
  nom,
  onSaisir,
}: {
  readonly customer: CustomerDetail;
  readonly nom: string;
  readonly onSaisir: (mode: 'note' | 'tache') => void;
}) {
  const t = useTranslations('crm.fiche.fil.barre');
  const personnel = usePersonnelActif();
  const [planifier, setPlanifier] = useState(false);
  return (
    <>
      <BarreDAction>
        <Button type="button" variant="outline" onClick={() => onSaisir('note')}>
          <Plus className="size-4" aria-hidden="true" />
          {t('note')}
        </Button>
        <Button type="button" variant="outline" onClick={() => onSaisir('tache')}>
          <Plus className="size-4" aria-hidden="true" />
          {t('tache')}
        </Button>
        {personnel ? (
          <Button type="button" variant="outline" onClick={() => setPlanifier(true)}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            {t('visite')}
          </Button>
        ) : null}
      </BarreDAction>
      {planifier ? (
        <PlanifierDialog
          customer={{ id: customer.id, libelle: nom, telephone: customer.phone ?? null, etape: customer.pipeline_stage ?? null }}
          property={customer.interested_property ? { id: customer.interested_property.id, libelle: customer.interested_property.title } : undefined}
          onClose={() => setPlanifier(false)}
        />
      ) : null}
    </>
  );
}
