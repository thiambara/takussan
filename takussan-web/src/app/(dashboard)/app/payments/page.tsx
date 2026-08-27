import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { PaymentsTabs } from '@/components/payments/PaymentsTabs';
import { getTranslations } from 'next-intl/server';

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
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.payments');
  await getMeAction();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <PaymentsTabs />
    </div>
  );
}
