import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { fetchIntegrationsAction } from '@/app/actions/admin-settings';
import { ResteARapprocher } from '@/components/admin/reconciliation/reste/ResteARapprocher';
import { fournisseursConnectes } from '@/components/admin/reconciliation/reste/fournisseurs';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.reconciliation');
  return { title: t('title') };
}

/**
 * TCK-593 (Partie 4) — `/app/agency/finances/reconciliation`, le rapprochement bancaire de l'agence.
 * Le rôle admin est exigé par `garderPageAdmin` ; cette page n'exige qu'une agence résolue.
 *
 * TCK-2675 — le reste à rapprocher d'abord (`ResteARapprocher`), l'import comme moyen. Les
 * fournisseurs de paiement CONNECTÉS (intégrations actives) sont lus ici : « Connecté » ne s'écrit
 * que d'après eux. Une lecture en échec ne bloque rien : la carte « Paiements en ligne » n'est pas rendue.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // TCK-633 — la page juge son accès (`PAGES_ADMIN`) ; l'API rejuge chaque appel (`BankStatementPolicy`).
  await garderPageAdmin('/app/agency/finances/reconciliation');
  const t = await getTranslations('admin.reconciliation');
  const user = await getMeAction();
  // Le rôle est jugé par `garderPageAdmin` ; l'API rejuge chaque appel (`BankStatementPolicy`).
  const agencyId = user.agency_id;
  if (!agencyId) return <NoAgencyState title={t('title')} />;

  const integrations = await fetchIntegrationsAction();
  // Une lecture en échec ne dit RIEN des intégrations (`null`) : la carte se tait plutôt que
  // d'affirmer « aucun paiement en ligne connecté ».
  const connectes = integrations.ok && integrations.data ? fournisseursConnectes(integrations.data.data) : null;

  return <ResteARapprocher agencyId={agencyId} fournisseursConnectes={connectes} />;
}
