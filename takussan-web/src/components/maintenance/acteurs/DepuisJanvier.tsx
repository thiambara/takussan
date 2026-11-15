'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { useBilanDuBailleur } from '@/lib/queries/maintenance-signalement';

/** L'historique d'un bien : l'onglet « Interventions » de sa fiche (`MaintenanceHistoryByProperty`). */
export const lienDeLHistoriqueDuBien = (id: number) => `/app/properties/${id}?tab=interventions`;

/**
 * TCK-2919 (ADR-0120 § 4) — « Depuis janvier » du bailleur (maquette `app-interventions` a, écran e6) :
 * deux chiffres que l'API calcule — « Interventions 12, dont 9 closes » et « À votre charge
 * 1 521 000 F, déduit de vos revenus » — et, par « Par bien » (téléphone) / « Historique par bien »
 * (bureau), le détail `by_property` : feuille du bas au téléphone, panneau latéral au bureau
 * (`FeuilleDuBas`), chaque bien menant à l'historique de ses interventions.
 *
 * Le mois du titre est celui de `since` servi (le 1er janvier par défaut) : jamais une date du
 * navigateur. Rien ne se rend sans intervention dans la période ; un échec de lecture se dit en une
 * ligne, sans masquer le reste de la page.
 */
export function DepuisJanvier({ lecture }: { readonly lecture: ReturnType<typeof useBilanDuBailleur> }) {
  const t = useTranslations('maintenance.bailleur.bilan');
  const f = useFormatteurs();
  const [ouvert, setOuvert] = useState(false);

  if (lecture.isPending) return <Skeleton className="h-36 rounded-xl" />;
  if (lecture.isError) {
    return (
      <p className="text-ui text-muted-foreground" role="status" data-slot="depuis-janvier-erreur">
        {t('erreur')}
      </p>
    );
  }
  const bilan = lecture.data?.data;
  if (!bilan || bilan.total === 0) return null;

  const mois = f.date(`${bilan.since}T12:00:00Z`, { dateStyle: undefined, month: 'long', timeZone: 'UTC' });
  const titre = t('titre', { mois });

  return (
    <section aria-labelledby="bailleur-depuis-janvier" className="space-y-3" data-slot="depuis-janvier">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="bailleur-depuis-janvier" className="font-display text-lg font-semibold tracking-titre">
          {titre}
        </h2>
        {bilan.by_property.length > 0 ? (
          <Button
            type="button"
            variant="link"
            className="h-auto flex-none p-0 text-sm font-medium text-primary-deep"
            onClick={() => setOuvert(true)}
            data-slot="bilan-par-bien"
          >
            <span className="md:hidden">{t('parBien')}</span>
            <span className="max-md:hidden">{t('historiqueParBien')}</span>
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Chiffre libelle={t('interventions')} valeur={String(bilan.total)} contexte={t('dontCloses', { n: bilan.closed })} />
        <Chiffre libelle={t('aVotreCharge')} valeur={f.montant(bilan.charged_amount, bilan.currency)} contexte={t('deduit')} />
      </div>

      <FeuilleDuBas open={ouvert} onOpenChange={setOuvert} titre={t('detailTitre', { mois })}>
        <ul className="divide-y divide-border" data-slot="bilan-des-biens">
          {bilan.by_property.map((b) => (
            <li key={b.property.id} className="relative flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 leading-tight">
                <Link href={lienDeLHistoriqueDuBien(b.property.id)} className="block truncate text-corps font-semibold after:absolute after:inset-0">
                  {b.property.title ?? t('bienSansTitre')}
                </Link>
                <span className="mt-0.5 block text-ui text-muted-foreground">{t('compteDuBien', { total: b.total, closes: b.closed })}</span>
              </span>
              <span className="flex-none text-corps font-semibold tabular-nums">{f.montant(b.charged_amount, bilan.currency)}</span>
              <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            </li>
          ))}
        </ul>
      </FeuilleDuBas>
    </section>
  );
}

function Chiffre({ libelle, valeur, contexte }: { readonly libelle: string; readonly valeur: string; readonly contexte: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-slot="chiffre-du-bilan">
      <p className="text-ui text-muted-foreground">{libelle}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-titre tabular-nums">{valeur}</p>
      <p className="mt-1 text-xs text-muted-foreground">{contexte}</p>
    </div>
  );
}
