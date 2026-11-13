'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { readProviderPreference, type GatewayProvider } from '@/hooks/useInitiatePayment';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import type { DetailMontantDu } from '../montant-du';
import { useLancerLePaiement } from '../useLancerLePaiement';
import { commenceParUneVoyelle } from './resume';

/**
 * TCK-2650 — « Payer » du locataire (maquette `app-paiements`, écran « Locataire — payer, choix du
 * moyen ») : une feuille au téléphone, un panneau à droite au bureau (`FeuilleDuBas`). Le décompte tel
 * que l'API le rend (`DetailMontantDu`, aucune addition), ce qui reste à régler à l'agence, et le choix
 * parmi les SEULS fournisseurs que le serveur ouvre à ce paiement (`GET /api/lease-payments/{id}/providers`,
 * TCK-602) — jamais la liste de toutes les passerelles de la devise.
 */
const PASSERELLES: readonly GatewayProvider[] = ['wave', 'orange_money', 'lemon_squeezy'];

export interface EcheanceAPayer {
  readonly paymentId: number;
  readonly currency: string | null;
  readonly montant: DetailMontantDu | undefined;
  /** Le montant affiché quand le décompte manque (le prochain loyer hors de l'horizon lu). */
  readonly montantAffiche: number;
  readonly nature: 'rent' | 'charges' | string;
  readonly periodStart: string | null;
}

export function PayerUneEcheance({
  echeance,
  aLAgence,
  libelle,
  variant = 'default',
  className,
}: {
  readonly echeance: EcheanceAPayer;
  /** `parts.payable_at_agency` : ce qui ne passe pas par ce paiement. */
  readonly aLAgence: number;
  readonly libelle: string;
  readonly variant?: 'default' | 'outline';
  readonly className?: string;
}) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size="lg" className={className} onClick={() => setOuverte(true)}>
        {libelle}
      </Button>
      {ouverte ? <FeuilleDePaiement echeance={echeance} aLAgence={aLAgence} open={ouverte} onOpenChange={setOuverte} /> : null}
    </>
  );
}

function FeuilleDePaiement({
  echeance,
  aLAgence,
  open,
  onOpenChange,
}: {
  readonly echeance: EcheanceAPayer;
  readonly aLAgence: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('payments.locataire.payer');
  const tFournisseur = useTranslations('payments.gateway.picker.providers');
  const f = useFormatteurs();
  const { providers, isLoading } = usePaymentProviders('lease-payments', echeance.paymentId);
  const { lancer, erreur, enCours } = useLancerLePaiement('lease-payments', echeance.paymentId);
  const [choix, setChoix] = useState<GatewayProvider | null>(null);

  const ouverts = PASSERELLES.filter((p) => providers.includes(p));
  const prefere = readProviderPreference();
  const choisi = choix ?? (prefere && ouverts.includes(prefere) ? prefere : (ouverts[0] ?? null));
  const devise = echeance.currency;
  const total = echeance.montant?.total ?? echeance.montantAffiche;

  const mois = echeance.periodStart ? f.date(echeance.periodStart, { month: 'long', year: 'numeric', dateStyle: undefined }) : null;
  const voyelle = mois && commenceParUneVoyelle(mois) ? 'oui' : 'non';
  const charges = echeance.nature === 'charges';
  const titre = mois ? t(charges ? 'titreCharges' : 'titreLoyer', { mois, voyelle }) : t(charges ? 'titreChargesSansMois' : 'titreLoyerSansMois');
  const ligne = mois ? t(charges ? 'chargesDe' : 'loyerDe', { mois, voyelle }) : t(charges ? 'charges' : 'loyer');

  const pied = (
    <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
      <Button type="button" variant="outline" size="lg" className="hidden md:inline-flex" onClick={() => onOpenChange(false)} disabled={enCours}>
        {t('annuler')}
      </Button>
      <Button type="button" size="lg" className="w-full md:w-auto" disabled={!choisi || enCours} onClick={() => choisi && void lancer(choisi)}>
        {enCours
          ? t('redirection')
          : choisi
            ? t('payerAvec', { montant: f.montantCourt(total, devise), fournisseur: tFournisseur(choisi) })
            : t('payer', { montant: f.montantCourt(total, devise) })}
      </Button>
    </div>
  );

  return (
    <FeuilleDuBas open={open} onOpenChange={onOpenChange} titre={titre} pied={pied}>
      <div data-slot="payer-une-echeance">
        <dl className="rounded-xl bg-muted/60 px-4 py-2 text-sm">
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{ligne}</dt>
            <dd className="flex-none text-right tabular-nums">{f.montantCourt(echeance.montant?.loyer ?? total, devise)}</dd>
          </div>
          {echeance.montant && echeance.montant.penaliteIncluse > 0 ? (
            <div className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{t('penalite')}</dt>
              <dd className="flex-none text-right tabular-nums">{f.montantCourt(echeance.montant.penaliteIncluse, devise)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4 border-t border-border py-2 text-corps font-semibold">
            <dt>{t('totalDebite')}</dt>
            <dd className="flex-none text-right tabular-nums" data-testid="total-debite">
              {f.montantCourt(total, devise)}
            </dd>
          </div>
        </dl>
        {aLAgence > 0 ? (
          <p className="mt-3 flex gap-2 text-ui leading-snug text-muted-foreground">
            <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
            {t('horsPaiement', { montant: f.montantCourt(aLAgence, devise) })}
          </p>
        ) : null}

        <p id="moyen-de-paiement" className="mt-5 text-sm font-semibold text-foreground">
          {t('moyen')}
        </p>
        {isLoading ? (
          <p className="mt-2 text-ui text-muted-foreground">{t('chargement')}</p>
        ) : ouverts.length === 0 ? (
          <p className="mt-2 text-ui text-muted-foreground" role="status">
            {t('aucunMoyen')}
          </p>
        ) : (
          <div role="radiogroup" aria-labelledby="moyen-de-paiement" className="mt-2 space-y-2">
            {ouverts.map((p) => {
              const actif = p === choisi;
              return (
                <label
                  key={p}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2 has-focus-visible:ring-3 has-focus-visible:ring-ring',
                    actif ? 'border-primary bg-secondary/50' : 'border-border bg-card',
                  )}
                >
                  <span className="min-w-0 flex-1 text-corps font-medium leading-tight text-foreground">{tFournisseur(p)}</span>
                  <input type="radio" name="moyen" value={p} checked={actif} onChange={() => setChoix(p)} className="size-5 flex-none accent-primary" />
                </label>
              );
            })}
          </div>
        )}
        {choisi ? <p className="mt-3 text-xs leading-snug text-muted-foreground">{t('suite', { fournisseur: tFournisseur(choisi) })}</p> : null}
        {erreur ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}
