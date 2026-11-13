'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { RappelDuSeuil } from '@/components/maintenance/acteurs/RappelDuSeuil';
import { QuotePdfButton } from '@/components/maintenance/QuotePdfButton';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { FicheDuBailleur } from '@/lib/maintenance/devis-du-bailleur';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { useApproveMaintenanceQuote, useMaintenanceRequest } from '@/lib/queries/maintenance';

/**
 * Le motif d'un refus est un formulaire (zod, react-hook-form) : chargé à la première ouverture,
 * jamais avec l'écran qui monte la décision — `/app/maintenance` et l'accueil sont des écrans de
 * lecture (TCK-1038, `zod-hors-des-ecrans-de-lecture.test.ts`).
 */
const QuoteRejectionModal = dynamic(() => import('@/components/maintenance/QuoteRejectionModal').then((m) => m.QuoteRejectionModal), { ssr: false });

const PHOTOS_MONTREES = 2;

export interface DecisionDuDevisProps {
  /** La ligne de la liste (`awaiting_owner`) ; les lignes du devis, le plafond et les gestes viennent de SA fiche. */
  readonly ligne: InterventionEnFile;
  /** Les deux premières photos de la demande, à gauche des lignes dès `xl` (la liste du bailleur). */
  readonly avecPhotos?: boolean;
  /** `POST …/quote/approve` a réussi. */
  readonly onApprouve?: () => void;
  /** L'API refuse le geste (403) : l'écran qui monte la décision le retire. */
  readonly onRefuse?: () => void;
  /** Le bailleur a refusé le devis, motif envoyé (`POST …/quote/reject`). */
  readonly onRejete?: () => void;
}

/**
 * TCK-2654 — la décision d'un devis qui attend l'accord du bailleur, en UN endroit : la carte de la
 * liste du bailleur (`InterventionsDuBailleur`) et la feuille de l'accueil (`FeuilleDuDevis`, TCK-2624)
 * la montent telle quelle. Elle porte le prestataire, les lignes et le total du devis (`quote_amount`,
 * jamais une somme refaite ici), le rappel du plafond (`RappelDuSeuil`), le PDF du devis (`QuotePdfButton`), puis « Approuver {montant} »
 * et « Refuser » — seulement quand la fiche sert `abilities.can_decide_quote`.
 *
 * Même fiche et même mutation que tout écran du devis (`useMaintenanceRequest`,
 * `useApproveMaintenanceQuote`) : même cache, même invalidation (`maintenanceKeys.all`).
 *
 * Après un refus, la machine d'état ramène la demande à `quote_submitted` ou à `cancelled`
 * (`MaintenanceStateMachine` : `rejected → quote_submitted | cancelled`) : d'où « Un nouveau devis
 * pourra vous être soumis », et rien de plus — aucun mécanisme n'engage l'agence à une autre solution.
 */
export function DecisionDuDevis({ ligne, avecPhotos = false, onApprouve, onRefuse, onRejete }: DecisionDuDevisProps) {
  const t = useTranslations('maintenance.bailleur.devis');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const lue = useMaintenanceRequest(ligne.id);
  const approuver = useApproveMaintenanceQuote(ligne.id);
  const [refus, setRefus] = useState(false);

  const fiche = lue.data?.data?.id === ligne.id ? (lue.data.data as FicheDuBailleur) : undefined;
  const demande = { ...ligne, ...(fiche ?? {}) } as FicheDuBailleur & InterventionEnFile;
  const peutDecider = fiche?.abilities?.can_decide_quote === true;
  const devise = demande.quote_currency ?? undefined;
  const artisan = demande.assignee?.name ?? null;
  const lignesDuDevis = demande.quote_lines ?? [];
  const photos = avecPhotos ? (demande.media?.photos ?? []).slice(0, PHOTOS_MONTREES) : [];

  const envoyer = () =>
    approuver.mutate(undefined, {
      onSuccess: () => onApprouve?.(),
      onError: (e) => {
        if (e instanceof ApiError && e.status === 403) onRefuse?.();
      },
    });

  return (
    <div data-slot="decision-du-devis">
      <div className="xl:flex xl:items-start xl:gap-5">
        {photos.length > 0 ? (
          <div className="flex gap-2 xl:w-[13.75rem] xl:flex-none xl:flex-col">
            {photos.map((p) => (
              <span key={p.id} className="h-24 flex-1 overflow-hidden rounded-xl bg-muted xl:h-[6.5rem] xl:flex-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de l'API, qui expire : l'optimiseur la mettrait en cache. */}
                <img src={p.thumbnail_url ?? p.url} alt={t('photo', { titre: demande.title })} loading="lazy" className="size-full object-cover" />
              </span>
            ))}
          </div>
        ) : null}
        <div className={photos.length > 0 ? 'mt-3 min-w-0 flex-1 rounded-xl bg-card px-4 py-2 xl:mt-0' : 'min-w-0 flex-1 rounded-xl bg-card px-4 py-2'}>
          <p className="border-b border-border py-2 text-ui text-muted-foreground">{artisan ? t('de', { nom: artisan }) : t('duPrestataire')}</p>
          <dl className="divide-y divide-border">
            {lignesDuDevis.map((l, i) => (
              <div key={`${l.label}-${i}`} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <dt className="min-w-0 text-muted-foreground">{l.label}</dt>
                <dd className="flex-none whitespace-nowrap tabular-nums">{f.montant(Number(l.total), devise)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-corps font-semibold">{t('total')}</dt>
              <dd className="flex-none whitespace-nowrap text-corps font-semibold tabular-nums" data-slot="total-du-devis">
                {f.montant(demande.quote_amount, devise)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <RappelDuSeuil fiche={fiche} className="mt-3" />
      {/* Le PDF du devis, sous `can_view_quote_pdf` : le lien de la maquette a-6, sans la référence « DV-… » que l'API ne sert pas. */}
      {fiche?.abilities?.can_view_quote_pdf ? (
        <div className="mt-1">
          <QuotePdfButton id={ligne.id} forme="lien" />
        </div>
      ) : null}

      {peutDecider ? (
        <>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="lg" className="min-w-0 flex-[2]" disabled={approuver.isPending} onClick={envoyer}>
              {t('approuver', { montant: f.montant(demande.quote_amount, devise) })}
            </Button>
            <Button type="button" size="lg" variant="outline" className="min-w-0 flex-1" onClick={() => setRefus(true)}>
              {t('refuser')}
            </Button>
          </div>
          <p className="mt-2.5 text-xs text-encre-douce">{t('motif')}</p>
          {approuver.error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {messageErreur(approuver.error, t('echec'))}
            </p>
          ) : null}
          {refus ? <QuoteRejectionModal id={ligne.id} open onClose={() => setRefus(false)} onRejected={onRejete} /> : null}
        </>
      ) : null}
    </div>
  );
}
