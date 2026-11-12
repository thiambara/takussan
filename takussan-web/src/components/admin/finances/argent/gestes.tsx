'use client';

import { useState, type ReactNode } from 'react';

import { CreateInvoiceDialog } from '@/components/payments/CreateInvoiceDialog';
import { CreatePayoutDialog } from '@/components/payments/CreatePayoutDialog';
import { InvoiceDetailDialog } from '@/components/payments/InvoiceDetailDialog';
import { PayoutDetailDialog } from '@/components/payments/PayoutDetailDialog';
import { useCan } from '@/hooks/useCan';
import type { OngletArgent } from '@/lib/finances/vue-argent';

/**
 * TCK-2659 — les gestes de « Argent » et leurs dialogues, montés UNE fois pour la page : l'en-tête
 * du bureau (« Générer une facture », « Créer un reversement »), la rubrique « Créer » du téléphone,
 * les registres (une ligne ouvre son détail) et la file « À approuver » du point du mois y mènent.
 *
 * TCK-528 — chaque geste suit SA capacité (`invoices.create`, `payouts.create`), que l'API juge sur
 * le profil actif : un admin au rôle personnalisé peut n'en porter qu'une. `canEmit` reste
 * nécessaire (la page peut refuser l'émission), plus suffisant. TCK-594 (ADR-0039 §4) — la file
 * « À approuver » n'existe qu'avec `payouts.approve`.
 */
export interface GestesDeLArgent {
  readonly emetFacture: boolean;
  readonly emetReversement: boolean;
  readonly peutApprouver: boolean;
  /**
   * TCK-2677 — le registre « Interventions » (factures des prestataires, TCK-594 / ADR-0039 § 8) suit
   * `payouts.create`, comme l'onglet `bills` de `/app/payments` qu'il remplace pour l'admin : valider
   * et « Payer le prestataire » (qui crée un reversement) sont des gestes de reversement. Sans
   * `canEmit` : l'ancien onglet ne le demandait pas.
   */
  readonly peutPayerLesPrestataires: boolean;
  /** Les capacités se lisent encore : le squelette tient la place des boutons. */
  readonly capacitesEnCours: boolean;
  readonly canEmit: boolean;
  readonly nouvelleFacture: () => void;
  readonly nouveauReversement: () => void;
  readonly ouvrirFacture: (id: number) => void;
  readonly ouvrirReversement: (id: number) => void;
}

export function useGestesDeLArgent(canEmit: boolean): GestesDeLArgent & { readonly dialogues: ReactNode } {
  const { can: peutFacturer, isLoading: facturationEnCours } = useCan('invoices.create');
  const { can: peutReverser, isLoading: reversementEnCours } = useCan('payouts.create');
  const { can: peutApprouver } = useCan('payouts.approve');
  const emetFacture = canEmit && peutFacturer;
  const emetReversement = canEmit && peutReverser;

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [payoutId, setPayoutId] = useState<number | null>(null);

  const dialogues = (
    <>
      {emetFacture ? (
        <CreateInvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} onCreated={(id) => setInvoiceId(id)} />
      ) : null}
      {emetReversement ? (
        <CreatePayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} onCreated={(id) => setPayoutId(id)} />
      ) : null}
      <InvoiceDetailDialog invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
      <PayoutDetailDialog payoutId={payoutId} onClose={() => setPayoutId(null)} />
    </>
  );

  return {
    emetFacture,
    emetReversement,
    peutApprouver,
    peutPayerLesPrestataires: peutReverser,
    capacitesEnCours: facturationEnCours || reversementEnCours,
    canEmit,
    nouvelleFacture: () => setInvoiceOpen(true),
    nouveauReversement: () => setPayoutOpen(true),
    ouvrirFacture: setInvoiceId,
    ouvrirReversement: setPayoutId,
    dialogues,
  };
}

/**
 * L'onglet que la page ouvre vraiment : un registre gardé par une capacité absente retombe sur
 * « Encaissements » — une fois les capacités lues. Tant qu'elles se lisent, l'onglet demandé tient
 * (un lien entrant vers `?tab=interventions` ne montre pas les encaissements le temps d'une lecture).
 */
export function ongletPermis(onglet: OngletArgent, gestes: Pick<GestesDeLArgent, 'peutApprouver' | 'peutPayerLesPrestataires' | 'capacitesEnCours'>): OngletArgent {
  if (onglet === 'a-approuver' && !gestes.peutApprouver) return 'encaissements';
  if (onglet === 'interventions' && !gestes.peutPayerLesPrestataires && !gestes.capacitesEnCours) return 'encaissements';
  return onglet;
}
