'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoicesTable } from '@/components/payments/InvoicesTable';
import { PayoutsTable } from '@/components/payments/PayoutsTable';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { OngletArgent } from '@/lib/finances/vue-argent';

import { EncaissementsAgence } from './argent/EncaissementsAgence';
import type { GestesDeLArgent } from './argent/gestes';
import { Impayes } from './impayes/Impayes';

/**
 * Les valeurs acceptées par `?tab=` — déclarées dans `lib/finances/vue-argent.ts` depuis TCK-2659,
 * réexportées ici pour les importeurs d'avant (TCK-375 : `AgencyQueues` renvoie vers
 * `?tab=impayes`, l'invariant se vérifie contre CETTE table).
 */
export { TAB_VALUES } from '@/lib/finances/vue-argent';

interface AdminFinancesTabsProps {
  /** L'onglet ouvert (`?tab=`, sinon « encaissements »). */
  readonly onglet: OngletArgent;
  readonly onChange: (onglet: OngletArgent) => void;
  readonly gestes: GestesDeLArgent;
  readonly telephone: boolean;
  /** `registre` : la page d'un registre ; `apercu` : sous le point du mois, au bureau. */
  readonly variante: 'registre' | 'apercu';
  readonly courant: string;
  readonly agencyId: number | undefined;
  /** Les comptes des onglets « À approuver » et « Impayés », lus de la synthèse. */
  readonly comptes?: { readonly aApprouver?: number; readonly impayes?: number };
  /**
   * Ce qui précède les registres et porte la barre d'onglets (l'en-tête de page du registre, sous
   * lequel elle se pose) ; sans lui, la barre ouvre le bloc. Rien au téléphone : un registre y est un
   * écran à part, sans onglets.
   */
  readonly entete?: (onglets: ReactNode) => ReactNode;
}

/**
 * TCK-134 — les cinq registres de « Argent » : encaissements, factures, reversements, « À approuver »
 * (réservé à `payouts.approve`, TCK-594) et impayés. L'onglet vit dans l'adresse (`?tab=`), qui reste
 * partageable et sûre au rechargement.
 *
 * TCK-2659 — les gestes de création ne sont plus ici : ils vivent dans l'en-tête de page (bureau) et
 * la rubrique « Créer » (téléphone), leurs dialogues montés une fois (`useGestesDeLArgent`).
 */
export function AdminFinancesTabs({ onglet, onChange, gestes, telephone, variante, courant, agencyId, comptes, entete }: AdminFinancesTabsProps) {
  const t = useTranslations('admin.finances');
  const f = useFormatteurs();
  const ouvert: OngletArgent = onglet === 'a-approuver' && !gestes.peutApprouver ? 'encaissements' : onglet;
  const compte = (n: number | undefined) =>
    n !== undefined && n > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{f.nombre(n)}</span> : null;

  const onglets = telephone ? null : (
    // Cinq onglets mesurent plus que la colonne à `lg` : le ruban défile dans son conteneur.
    <div className="-mx-1 max-w-full overflow-x-auto px-1">
      <TabsList variant="line">
        <TabsTrigger value="encaissements">{t('tabs.payments')}</TabsTrigger>
        <TabsTrigger value="factures">{t('tabs.invoices')}</TabsTrigger>
        <TabsTrigger value="reversements">{t('tabs.payouts')}</TabsTrigger>
        {gestes.peutApprouver ? (
          <TabsTrigger value="a-approuver">
            {t('tabs.toApprove')} {compte(comptes?.aApprouver)}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="impayes">
          {t('tabs.overdue')} {compte(comptes?.impayes)}
        </TabsTrigger>
      </TabsList>
    </div>
  );

  return (
    <Tabs value={ouvert} onValueChange={(v) => onChange(v as OngletArgent)}>
      {entete ? entete(onglets) : onglets}

      <TabsContent value="encaissements" className={telephone ? undefined : 'pt-4'}>
        <EncaissementsAgence courant={courant} telephone={telephone} variante={variante} agencyId={agencyId} />
      </TabsContent>

      <TabsContent value="factures" className="space-y-4 pt-4">
        <InvoicesTable onSelect={gestes.ouvrirFacture} />
      </TabsContent>

      <TabsContent value="reversements" className="space-y-4 pt-4">
        <PayoutsTable onSelect={gestes.ouvrirReversement} />
      </TabsContent>

      {gestes.peutApprouver ? (
        <TabsContent value="a-approuver" className="space-y-4 pt-4">
          <PayoutsTable onSelect={gestes.ouvrirReversement} status="awaiting_approval" />
        </TabsContent>
      ) : null}

      <TabsContent value="impayes" className="space-y-4 pt-4">
        <Impayes agencyId={agencyId} />
      </TabsContent>
    </Tabs>
  );
}
