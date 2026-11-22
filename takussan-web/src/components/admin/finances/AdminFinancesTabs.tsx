'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoicesTable } from '@/components/payments/InvoicesTable';
import { OwnerStatementPanel } from '@/components/payments/OwnerStatementPanel';
import { PayoutsTable } from '@/components/payments/PayoutsTable';
import { ServiceProviderBillsTable } from '@/components/payments/ServiceProviderBillsTable';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { isOwner } from '@/lib/roles';
import type { OngletArgent } from '@/lib/finances/vue-argent';

import { EncaissementsAgence } from './argent/EncaissementsAgence';
import { ongletPermis, type GestesDeLArgent } from './argent/gestes';
import { Impayes } from './impayes/Impayes';
import type { DemandeDeRelance } from './impayes/relance-de-l-adresse';

/**
 * Les valeurs acceptées par `?tab=` — déclarées dans `lib/finances/vue-argent.ts` depuis TCK-2659,
 * réexportées ici pour les importeurs d'avant (TCK-375 : l'ancien bloc de files d'attente de la vue
 * d'agence renvoyait vers `?tab=impayes`, l'invariant se vérifiait contre CETTE table ; retiré par TCK-2799).
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
  /** TCK-2775 — la relance que l'adresse demande (`?relance=`), ouverte par l'écran Impayés. */
  readonly relanceDemandee?: DemandeDeRelance | null;
  readonly onRelancePrise?: () => void;
}

/**
 * TCK-134 — les registres de « Argent » : encaissements, factures, reversements, « À approuver »
 * (réservé à `payouts.approve`, TCK-594), « Interventions » (factures des prestataires, réservé à
 * `payouts.create` — TCK-2677) et impayés. L'onglet vit dans l'adresse (`?tab=`), qui reste
 * partageable et sûre au rechargement.
 *
 * TCK-2659 — les gestes de création ne sont plus ici : ils vivent dans l'en-tête de page (bureau) et
 * la rubrique « Créer » (téléphone), leurs dialogues montés une fois (`useGestesDeLArgent`).
 */
export function AdminFinancesTabs({ onglet, onChange, gestes, telephone, variante, courant, agencyId, comptes, entete, relanceDemandee, onRelancePrise }: AdminFinancesTabsProps) {
  const t = useTranslations('admin.finances');
  const f = useFormatteurs();
  const ouvert = ongletPermis(onglet, gestes);
  // TCK-2749 — l'admin qui est AUSSI bailleur dans l'agence active (`roles` : les profils de l'agence
  // active, TCK-2002) trouve SON relevé de gérance au-dessus des reversements de l'agence, comme dans
  // l'onglet `payouts` de `/app/payments` qu'il quitte pour « Argent » (`menerALArgent`).
  const { user } = useAuth();
  const estBailleur = isOwner(user?.roles ?? []);
  const compte = (n: number | undefined) =>
    n !== undefined && n > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{f.nombre(n)}</span> : null;

  const onglets = telephone ? null : (
    // Cinq ou six onglets mesurent plus que la colonne à `lg` : le ruban défile dans son conteneur.
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
        {gestes.peutPayerLesPrestataires ? <TabsTrigger value="interventions">{t('tabs.interventions')}</TabsTrigger> : null}
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
        {estBailleur ? <OwnerStatementPanel /> : null}
        <PayoutsTable onSelect={gestes.ouvrirReversement} />
      </TabsContent>

      {gestes.peutApprouver ? (
        <TabsContent value="a-approuver" className="space-y-4 pt-4">
          <PayoutsTable onSelect={gestes.ouvrirReversement} status="awaiting_approval" />
        </TabsContent>
      ) : null}

      {/* TCK-2677 — l'onglet `bills` de `/app/payments`, le même composant : mêmes factures, mêmes gestes. */}
      {gestes.peutPayerLesPrestataires ? (
        <TabsContent value="interventions" className="space-y-4 pt-4">
          <ServiceProviderBillsTable mode="agency" onPaid={gestes.ouvrirReversement} titreMasque />
        </TabsContent>
      ) : null}

      {/* TCK-2840 — au téléphone, aucune marge haute : la page pose `pt-3` et le résumé `pt-2` (20 px, maquette). */}
      <TabsContent value="impayes" className={telephone ? 'space-y-4' : 'space-y-4 pt-4'}>
        <Impayes agencyId={agencyId} relanceDemandee={relanceDemandee} onRelancePrise={onRelancePrise} />
      </TabsContent>
    </Tabs>
  );
}
