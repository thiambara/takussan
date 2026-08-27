import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.inventories');
  return { title: t('metaTitle') };
}
import { InventoryList } from '@/components/inventory';
import { getTranslations } from 'next-intl/server';
import { isAdmin, isAgent } from '@/lib/roles';
import { PageHeader } from '@/components/console';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.inventories');
  const user = await getMeAction();
  // TCK-379 — `docs/features.md` §1.9 donne « Créer un inventaire d'entrée ou de sortie » en P1
  // au seul acteur 🧑‍💼 (agent immobilier). `isAdmin` couvre `agency_admin` et `super_admin`,
  // surensemble de l'agent partout ailleurs dans ce dépôt. Le bailleur (🏢) n'apparaît en §1.9
  // que sur la SIGNATURE (P2) : lui ouvrir la création serait élargir un accès, ce que le
  // ticket interdit explicitement.
  const canCreate = isAgent(user.roles) || isAdmin(user.roles);
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <InventoryList canCreate={canCreate} />
    </div>
  );
}
