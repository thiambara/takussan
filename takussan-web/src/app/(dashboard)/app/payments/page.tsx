import { getMeAction } from '@/app/actions/auth';
import { PaymentsTabs } from '@/components/payments/PaymentsTabs';

/**
 * TCK-063 — page principale des paiements. Expose 3 onglets :
 *   - Historique (vue unifiée booking_payments + lease_payments)
 *   - Factures (CRUD + transitions de statut)
 *   - Payouts (reversements bailleurs)
 *
 * Filtres persistés en URL via `useSearchParams`. L'auth est vérifiée côté
 * serveur avant rendu pour cohérence avec les autres pages dashboard.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await getMeAction();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Paiements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historique, factures et reversements bailleurs — suivi unifié.
        </p>
      </header>
      <PaymentsTabs />
    </div>
  );
}
