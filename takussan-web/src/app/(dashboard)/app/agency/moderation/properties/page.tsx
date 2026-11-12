import { PropertyModerationWorkspace } from '@/components/admin/PropertyModerationWorkspace';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.propertyModeration');
  return { title: t('title') };
}

/**
 * TCK-098 — Admin property moderation queue.
 * Both `agency_admin` and `super_admin` may access (role check enforced by backend).
 * Standard-only (TCK-633 : `PAGES_ADMIN`) — un admin d'agence `individual` est renvoyé vers sa
 * première page accessible.
 *
 * TCK-2673 — la tête de page (« Modération », comptes du jour, onglets « Avis · Biens à valider »)
 * est celle de l'espace de travail, qui connaît ses comptes : la même que la file des avis.
 */
export default async function PropertyModerationPage() {
  await garderPageAdmin('/app/agency/moderation/properties');
  return <PropertyModerationWorkspace />;
}
