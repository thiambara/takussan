import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { PaymentsTabs } from '@/components/payments/PaymentsTabs';
import { CustomerPayments } from '@/components/payments/CustomerPayments';
import { isCustomerOnly } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.payments');
  return { title: t('metaTitle') };
}

/**
 * TCK-063 — page principale des paiements. Expose 3 onglets :
 *   - Historique (vue unifiée booking_payments + lease_payments)
 *   - Factures (CRUD + transitions de statut)
 *   - Payouts (reversements bailleurs)
 *
 * Filtres persistés en URL via `useSearchParams`. L'auth est vérifiée côté
 * serveur avant rendu pour cohérence avec les autres pages dashboard.
 *
 * TCK-593 — le client (locataire, acheteur) ne reçoit PAS ces onglets : `CustomerPayments` lui
 * montre ce qu'il doit, « Payer », et son historique en lecture seule — sans « reversements ».
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.payments');
  const user = await getMeAction();
  const client = isCustomerOnly(user.roles);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={client ? t('customerSubtitle') : t('subtitle')} />
      {client ? <CustomerPayments /> : <PaymentsTabs />}
    </div>
  );
}
