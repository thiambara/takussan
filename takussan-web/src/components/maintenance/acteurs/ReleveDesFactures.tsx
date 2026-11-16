'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useTelechargementApi } from '@/hooks/useTelechargementApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { bornesDuMois, dateDuMois, derniersMois, moisCourant } from '@/lib/finances/mois';
import { cn } from '@/lib/utils';

/** Le relevé des factures du prestataire appelant (ADR-0120 § 2) ; `from`/`to` inclus, 366 jours au plus. */
export function cheminDuReleve(du: string, au: string): string {
  return `/api/service-provider-bills/statement/pdf?${new URLSearchParams({ from: du, to: au }).toString()}`;
}

/**
 * TCK-2919 (ADR-0120 § 2) — « Relevé de mes factures » (maquette `app-interventions` a, e7, bureau :
 * bouton de la tête de page). Il propose la période — le mois en cours par défaut, l'un des douze
 * derniers, ou l'année en cours jusqu'à ce jour — puis télécharge le PDF
 * (`GET /api/service-provider-bills/statement/pdf?from=…&to=…`) par `useTelechargementApi` (jeton,
 * blob, nom de fichier donné ici). Les mois se nomment par `useFormatteurs()`, jamais par un
 * `<input type="month">`.
 */
export function ReleveDesFactures() {
  const t = useTranslations('maintenance.prestataire.releve');
  const f = useFormatteurs();
  const telechargement = useTelechargementApi();
  const [ouvert, setOuvert] = useState(false);
  const courant = moisCourant();
  const annee = courant.slice(0, 4);
  const [choix, setChoix] = useState<string>(courant);

  const nomDuMois = (m: string) => {
    const nom = f.date(dateDuMois(m), { dateStyle: undefined, month: 'long', year: 'numeric', timeZone: 'UTC' });
    return nom.charAt(0).toLocaleUpperCase(f.locale) + nom.slice(1);
  };
  const periodes = [
    ...derniersMois(courant).map((m) => ({ cle: m, libelle: m === courant ? t('moisEnCours', { mois: nomDuMois(m) }) : nomDuMois(m), ...bornesDuMois(m) })),
    { cle: annee, libelle: t('annee', { annee }), du: `${annee}-01-01`, au: bornesDuMois(courant).au },
  ];
  const choisie = periodes.find((p) => p.cle === choix) ?? periodes[0];

  const telecharger = async () => {
    if (!choisie) return;
    const ok = await telechargement.telecharger(cheminDuReleve(choisie.du, choisie.au), `releve-factures-${choisie.cle}.pdf`);
    if (ok) setOuvert(false);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOuvert(true)} data-slot="releve-des-factures">
        <Download data-icon="inline-start" aria-hidden="true" />
        {t('bouton')}
      </Button>
      <FeuilleDuBas
        open={ouvert}
        onOpenChange={setOuvert}
        titre={t('titre')}
        pied={
          <Button type="button" size="lg" disabled={telechargement.enCours} onClick={() => void telecharger()}>
            <Download data-icon="inline-start" aria-hidden="true" />
            {telechargement.enCours ? t('enCours') : t('telecharger')}
          </Button>
        }
      >
        <p className="mb-3 text-ui text-muted-foreground">{t('aide')}</p>
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label={t('periode')}>
          {periodes.map((p) => (
            <li key={p.cle}>
              <button
                type="button"
                aria-pressed={p.cle === choisie?.cle}
                onClick={() => setChoix(p.cle)}
                className={cn('flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring', p.cle === choisie?.cle && 'font-semibold text-primary-deep')}
              >
                {p.libelle}
                {p.cle === choisie?.cle ? <Check className="size-4 flex-none" aria-hidden="true" /> : null}
              </button>
            </li>
          ))}
        </ul>
        {telechargement.echec ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t(`echec.${telechargement.echec}`)}
          </p>
        ) : null}
      </FeuilleDuBas>
    </>
  );
}
