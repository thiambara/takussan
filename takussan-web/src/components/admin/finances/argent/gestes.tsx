'use client';

import { useState, type ReactNode } from 'react';

import { CreateInvoiceDialog } from '@/components/payments/CreateInvoiceDialog';
import { CreatePayoutDialog } from '@/components/payments/CreatePayoutDialog';
import { InvoiceDetailDialog } from '@/components/payments/InvoiceDetailDialog';
import { PayoutDetailDialog } from '@/components/payments/PayoutDetailDialog';
import { useCan } from '@/hooks/useCan';

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
    capacitesEnCours: facturationEnCours || reversementEnCours,
    canEmit,
    nouvelleFacture: () => setInvoiceOpen(true),
    nouveauReversement: () => setPayoutOpen(true),
    ouvrirFacture: setInvoiceId,
    ouvrirReversement: setPayoutId,
    dialogues,
  };
}
