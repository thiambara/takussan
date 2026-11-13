import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { PaymentsTabs } from '@/components/payments/PaymentsTabs';
import { CustomerPayments } from '@/components/payments/CustomerPayments';
import { isCustomerOnly } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { aiguillerVersLArgent } from '@/lib/access/pages-admin-server';
import type { ParametresDeLaPage } from '@/lib/finances/depuis-les-paiements';

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
 *
 * TCK-2677 (ADR-0100 § 4 et § 7) — l'admin de l'agence active (standard) n'a qu'une page pour
 * l'argent de l'agence : « Argent ». Un lien ancien, une notification (`?tab=payouts`,
 * `?tab=approvals`, `?tab=bills`) ou un favori l'y mène, sur l'onglet qui correspond, filtres de
 * l'historique compris (`adresseDeLArgent`) — l'admin qui est aussi bailleur compris, dont le relevé
 * de gérance est au registre « Reversements » (TCK-2749). L'agent, l'hôte, le bailleur, le locataire
 * et le client restent ici (`aiguillerVersLArgent`, `menerALArgent`) ; `/app/payments/return` n'est
 * pas concerné.
 *
 * ⚠ La redirection se décide DANS la page et n'est sous AUCUN `loading.tsx` : un repli dans ce
 * segment (il y en avait un) change son 307 en 200 : le squelette part, puis le navigateur rebondit
 * (`app/__tests__/etats-de-route.test.ts`). Un layout ne lit pas `searchParams` : il ne saurait pas
 * traduire l'onglet.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { readonly searchParams: Promise<ParametresDeLaPage> }) {
  const user = await getMeAction();
  await aiguillerVersLArgent(user, searchParams);

  const t = await getTranslations('dashboard.pages.payments');
  const client = isCustomerOnly(user.roles);

  return (
    <div className="space-y-6">
      {/* TCK-2650 — au téléphone, le locataire ouvre sur ce qu'il doit (maquette `app-paiements`) : la barre du haut porte déjà « Paiements », l'en-tête n'y reste que pour les lecteurs d'écran. */}
      <PageHeader title={t('title')} description={client ? t('customerSubtitle') : t('subtitle')} className={client ? 'max-lg:sr-only' : undefined} />
      {client ? <CustomerPayments /> : <PaymentsTabs />}
    </div>
  );
}
