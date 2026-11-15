'use client';

import { useTranslations } from 'next-intl';
import { useFormContext, useWatch } from 'react-hook-form';
import { Copy } from 'lucide-react';

import type { ValeursDeLaFiche } from '@/lib/agence/fiche';
import { COORDONNEES_BANCAIRES_MAX } from '@/lib/schemas/agency';

import { ChampDeLaFiche, ZoneDeLaFiche } from './champs';
import { useFiche } from './contexte';
import { CadreDApercu, LogoDeLAgence, TitreDeSection } from './pieces';

/**
 * TCK-2670 — « Paiement hors ligne » (TCK-2536) : Wave, Orange Money, coordonnées bancaires — pour
 * toute agence, individuelle comprise. Un champ ne part que s'il a changé ; vidé, il part `null`.
 * L'aperçu montre ce que le locataire lit sur son lien de paiement.
 */
export function SectionPaiement() {
  const t = useTranslations('admin.agencyConfig.offlinePayment');
  const tFiche = useTranslations('admin.agencyConfig.fiche.paiement');
  const { control } = useFormContext<ValeursDeLaFiche>();
  const banque = useWatch({ control, name: 'offline_payment_bank_details' }) ?? '';

  return (
    <section aria-labelledby="titre-section-paiement" data-section="paiement">
      <TitreDeSection id="titre-section-paiement" titre={tFiche('titre')} texte={tFiche('texte')} />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <ChampDeLaFiche
            name="offline_payment_wave_number"
            libelle={t('wave')}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="77 123 45 67"
            aide={t('phoneHint')}
          />
          <ChampDeLaFiche
            name="offline_payment_orange_money_number"
            libelle={t('orangeMoney')}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="77 123 45 67"
          />
          <ZoneDeLaFiche
            name="offline_payment_bank_details"
            libelle={t('bankDetails')}
            rows={3}
            maxLength={COORDONNEES_BANCAIRES_MAX}
            placeholder={t('bankDetailsPlaceholder')}
            aide={t('bankDetailsPlaceholder')}
            compteur={t('bankDetailsCount', { count: banque.length, max: COORDONNEES_BANCAIRES_MAX })}
          />
        </div>
        <div className="w-full flex-none xl:w-[21.25rem]">
          <ApercuDuLien />
        </div>
      </div>
      <p className="mt-5 text-ui text-muted-foreground md:hidden">{tFiche('rienNeSePerd')}</p>
    </section>
  );
}

/** Ce que le locataire lit sur son lien de paiement, avec la saisie en cours. */
function ApercuDuLien() {
  const tFiche = useTranslations('admin.agencyConfig.fiche.paiement');
  const { agence } = useFiche();
  const { control } = useFormContext<ValeursDeLaFiche>();
  const [wave, orange, banque, nom] = useWatch({
    control,
    name: ['offline_payment_wave_number', 'offline_payment_orange_money_number', 'offline_payment_bank_details', 'name'],
  });
  const numeros = [
    [tFiche('moyenWave'), (wave ?? '').trim()],
    [tFiche('moyenOrangeMoney'), (orange ?? '').trim()],
  ].filter(([, n]) => n !== '');
  const lignesBanque = (banque ?? '').trim().split('\n').filter((l) => l.trim() !== '');
  const vide = numeros.length === 0 && lignesBanque.length === 0;

  return (
    <CadreDApercu titre={tFiche('apercu')}>
      <div className="rounded-xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-2.5">
          <LogoDeLAgence url={agence.logo_url} nom={nom || agence.name} taille={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">{nom || agence.name}</p>
            <p className="truncate text-xs text-muted-foreground">{tFiche('apercuObjet')}</p>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-muted-foreground">{tFiche('payerALAgence')}</p>
        {vide ? (
          <p className="mt-1.5 rounded-lg border border-dashed border-warning/70 px-3 py-2 text-ui text-muted-foreground">
            {tFiche('apercuVide')}
          </p>
        ) : (
          <div className="mt-1.5 divide-y divide-border/70 rounded-lg border border-border">
            {numeros.map(([moyen, numero]) => (
              <div key={moyen} className="flex h-11 items-center gap-2 px-3 text-sm">
                <span className="flex-1 font-medium">{moyen}</span>
                <span className="tabular-nums">{numero}</span>
                <Copy className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
            ))}
            {lignesBanque.length > 0 ? (
              <div className="px-3 py-2.5 text-sm">
                <p className="font-medium">{tFiche('virement')}</p>
                {lignesBanque.map((ligne, i) => (
                  <p key={i} className="text-ui tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
                    {ligne}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </CadreDApercu>
  );
}
