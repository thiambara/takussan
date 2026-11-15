'use client';

import { useTranslations } from 'next-intl';
import { useFormContext, useWatch } from 'react-hook-form';

import { FormSelect } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { repriseDesNumeros, type ValeursDeLaFiche } from '@/lib/agence/fiche';
import { CURRENCY_METADATA, formatMontant, type CurrencyCode } from '@/lib/format/currency';
import { cn } from '@/lib/utils';

import { ChampDeLaFiche, ZoneDeLaFiche } from './champs';
import { useFiche } from './contexte';
import { CadreDApercu, EncartManque, GroupeDeChamps, LogoDeLAgence, TitreDeSection } from './pieces';

const OPTIONS_DE_DEVISE = (Object.keys(CURRENCY_METADATA) as CurrencyCode[])
  // XOF, EUR, USD seulement : XAF reste lisible côté serveur pour d'anciennes données.
  .filter((code) => code === 'XOF' || code === 'EUR' || code === 'USD')
  .map((code) => ({ value: code, label: `${code} (${CURRENCY_METADATA[code].symbol})` }));

/** Le montant HT de la facture d'exemple de l'aperçu. */
const EXEMPLE_HT = 100_000;

/**
 * TCK-2670 — « Facturation et mentions légales » : TVA, commission, devise ; raison sociale, NINEA,
 * RCCM, siège (jamais pour une agence individuelle : l'API les refuse). « Reprendre ces deux numéros »
 * remplit les mentions vides que porte le dossier de vérification — et n'enregistre RIEN : les champs
 * sont marqués modifiés, « Enregistrer » fait le reste (AC4).
 */
export function SectionFacturation() {
  const t = useTranslations('admin.agencyConfig');
  const tCurrency = useTranslations('agency.currency');
  const tFiche = useTranslations('admin.agencyConfig.fiche.facturation');
  const { agence, individuelle, numerosDuDossier } = useFiche();
  const { control, setValue } = useFormContext<ValeursDeLaFiche>();
  const [ninea, rccm, devise] = useWatch({ control, name: ['ninea', 'rccm', 'currency'] });
  const deviseChoisie = ((devise as string) || 'XOF').toUpperCase() as CurrencyCode;
  const deviseChangee = deviseChoisie !== ((agence.currency ?? 'XOF').toUpperCase() as CurrencyCode);
  const reprise = individuelle ? {} : repriseDesNumeros({ ninea: ninea ?? '', rccm: rccm ?? '' }, numerosDuDossier);
  const aReprendre = Object.keys(reprise) as ('ninea' | 'rccm')[];

  function reprendre() {
    for (const champ of aReprendre) {
      setValue(champ, reprise[champ] ?? '', { shouldDirty: true, shouldValidate: true });
    }
  }

  const bouton = (large: boolean) => (
    <Button type="button" onClick={reprendre} className={cn(large ? 'flex-none self-center max-md:hidden' : 'mt-3 h-11 w-full md:hidden')}>
      {aReprendre.length === 2 ? tFiche('reprendreLesDeux') : tFiche('reprendreUn')}
    </Button>
  );

  return (
    <section aria-labelledby="titre-section-facturation" data-section="facturation">
      <TitreDeSection
        id="titre-section-facturation"
        titre={individuelle ? tFiche('titreIndividuelle') : tFiche('titre')}
        texte={individuelle ? tFiche('texteIndividuelle') : tFiche('texte')}
        texteAuBureauSeulement
      />
      {aReprendre.length > 0 ? (
        <EncartManque
          className="mb-5"
          titre={aReprendre.length === 2 ? tFiche('repriseTitreLesDeux') : tFiche('repriseTitreUn', { numero: aReprendre[0] === 'ninea' ? 'NINEA' : 'RCCM' })}
          action={bouton(true)}
        >
          <p>
            {tFiche.rich('repriseTexte', {
              numeros: () => (
                <>
                  {aReprendre.map((c, i) => (
                    <span key={c}>
                      {i > 0 ? ', ' : ''}
                      {c === 'ninea' ? 'NINEA' : 'RCCM'} <span className="font-medium tabular-nums">{reprise[c]}</span>
                    </span>
                  ))}
                </>
              ),
            })}
          </p>
          {bouton(false)}
        </EncartManque>
      ) : null}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1 space-y-5">
          <GroupeDeChamps titre={tFiche('groupeFacturation')} texte={tFiche('groupeFacturationTexte')}>
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
              <ChampDeLaFiche name="default_tax_rate" libelle={t('moneyOut.taxRate')} inputMode="decimal" aide={t('fields.emptyRateIsZero')} />
              <ChampDeLaFiche name="commission_rate" libelle={t('fields.commission')} inputMode="decimal" aide={t('fields.emptyRateIsZero')} />
            </div>
            <div>
              <FormSelect
                control={control}
                name="currency"
                label={tCurrency('label')}
                options={OPTIONS_DE_DEVISE}
                placeholder={tCurrency('placeholder')}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {tCurrency('preview', { example: formatMontant(100_000, deviseChoisie) })}
              </p>
              {deviseChangee ? (
                <p role="alert" className="mt-1.5 rounded-md bg-primary/5 px-2 py-1.5 text-xs text-foreground">
                  {tCurrency('warningOnChange')}
                </p>
              ) : null}
            </div>
          </GroupeDeChamps>
          {individuelle ? null : (
            <GroupeDeChamps titre={tFiche('groupeMentions')} texte={tFiche('groupeMentionsTexte')} className="border-t border-border pt-5">
              <ChampDeLaFiche name="legal_name" libelle={t('moneyOut.legalName')} />
              <div className="grid gap-4 md:grid-cols-2 md:items-start">
                <ChampDeLaFiche
                  name="ninea"
                  libelle={t('moneyOut.ninea')}
                  placeholder={reprise.ninea ? tFiche('aReprendre') : undefined}
                />
                <ChampDeLaFiche name="rccm" libelle={t('moneyOut.rccm')} placeholder={reprise.rccm ? tFiche('aReprendre') : undefined} />
              </div>
              <ZoneDeLaFiche name="legal_address" libelle={t('moneyOut.legalAddress')} rows={2} />
            </GroupeDeChamps>
          )}
        </div>
        <div className="w-full flex-none xl:sticky xl:top-6 xl:w-80">
          <ApercuDeLaFacture devise={deviseChoisie} />
        </div>
      </div>
    </section>
  );
}

/** Ce qui s'imprime sur une facture, avec la saisie en cours — sur un montant d'exemple. */
function ApercuDeLaFacture({ devise }: { readonly devise: CurrencyCode }) {
  const tFiche = useTranslations('admin.agencyConfig.fiche.facturation');
  const { agence, individuelle } = useFiche();
  const { control } = useFormContext<ValeursDeLaFiche>();
  const [nom, raison, ninea, rccm, siege, tva] = useWatch({
    control,
    name: ['name', 'legal_name', 'ninea', 'rccm', 'legal_address', 'default_tax_rate'],
  });
  const taux = Number.isFinite(Number(tva)) && (tva ?? '').trim() !== '' ? Number(tva) : 0;
  const taxe = Math.round((EXEMPLE_HT * taux) / 100);
  const identifiants = [ninea?.trim() ? `NINEA ${ninea.trim()}` : null, rccm?.trim() ? `RCCM ${rccm.trim()}` : null].filter(Boolean);
  const manquent = !individuelle && identifiants.length < 2;

  return (
    <CadreDApercu titre={tFiche('apercu')}>
      <div className="rounded-xl border border-border bg-card p-3.5">
        <div className="flex items-start gap-3">
          <LogoDeLAgence url={agence.logo_url} nom={nom || agence.name} taille={40} />
          <div className="min-w-0 flex-1 text-ui leading-snug">
            <p className="text-sm font-semibold">{(individuelle ? '' : raison?.trim()) || nom || agence.name}</p>
            {!individuelle && siege?.trim() ? <p className="whitespace-pre-line text-muted-foreground">{siege.trim()}</p> : null}
            {identifiants.length > 0 ? <p className="tabular-nums text-muted-foreground">{identifiants.join(' · ')}</p> : null}
            {manquent ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-medium">
                <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
                {identifiants.length === 0 ? tFiche('apercuAbsents') : !ninea?.trim() ? tFiche('apercuNineaAbsent') : tFiche('apercuRccmAbsent')}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{tFiche('apercuExemple')}</p>
        <div className="mt-2 space-y-1.5 border-t border-border pt-2.5 text-ui tabular-nums">
          <p className="flex gap-2">
            <span className="min-w-0 flex-1 text-muted-foreground">{tFiche('apercuHonoraires')}</span>
            {formatMontant(EXEMPLE_HT, devise)}
          </p>
          <p className="flex gap-2">
            <span className="min-w-0 flex-1 text-muted-foreground">{tFiche('apercuTva', { taux })}</span>
            {formatMontant(taxe, devise)}
          </p>
          <p className="flex gap-2 border-t border-border pt-1.5 text-sm font-semibold">
            <span className="min-w-0 flex-1">{tFiche('apercuTotal')}</span>
            {formatMontant(EXEMPLE_HT + taxe, devise)}
          </p>
        </div>
      </div>
    </CadreDApercu>
  );
}
