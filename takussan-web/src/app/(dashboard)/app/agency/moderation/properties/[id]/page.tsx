import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ApercuDuBienAValider } from '@/components/admin/ApercuDuBienAValider';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { idDeDetail } from '@/lib/detail/ressource-de-detail';
import { getToken } from '@/lib/session';

import { lireBienAValiderDuRendu } from './lecture';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.propertyModeration.bien');
  return { title: t('apercuMeta') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-2931 — l'aperçu complet d'un bien à valider (maquette `app-moderation` B, « Ouvrir l'aperçu
 * complet de la fiche » au téléphone, « Ouvrir en grand » au bureau) : la fiche du bien NON PUBLIÉ
 * telle que le public la verra, rendue depuis la seule lecture de modération — jamais une route
 * publique —, sous un bandeau « Aperçu — ce bien n'est pas encore publié ».
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // TCK-633 — un segment dynamique est gardé par son plus proche ancêtre statique de `PAGES_ADMIN`.
  await garderPageAdmin('/app/agency/moderation/properties');
  // Un identifiant illisible, un bien absent ou hors de portée sont refusés en 404 par `layout.tsx`.
  const id = idDeDetail((await params).id) as number;
  const token = await getToken();
  // La lecture du layout, partagée (`cache()`) ; une panne laisse le navigateur relire et la dire.
  const lu = token ? await lireBienAValiderDuRendu(token, id).catch(() => null) : null;
  return <ApercuDuBienAValider id={id} initial={lu?.data ?? null} />;
}
