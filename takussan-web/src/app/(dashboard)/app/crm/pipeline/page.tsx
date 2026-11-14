import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageDuPipeline } from '@/components/pipeline/PageDuPipeline';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { nomAffichable } from '@/lib/identite';
import { fetchCrmTags } from '@/lib/queries/customers';
import { isAdmin, isAgent } from '@/lib/roles';
import { getToken } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.crmPipeline');
  return { title: t('metaTitle') };
}

/**
 * TCK-2592 — le pipeline : « À relancer » triée par retard, et le kanban à quatre colonnes vivantes
 * (maquette `app-pipeline` a). La page serveur fournit le LECTEUR : le personnel (agent ou admin) a la
 * portée et les relances, l'admin ouvre sur « Agence », et « Agence » ou un agent isolé demandent la
 * lecture de l'agence (`crm.view_all`, que `pipeline-stats?scope=agency` exige — 403 sinon). Le reste
 * (URL, lectures, glisser-déposer, mises à jour optimistes) vit dans le navigateur.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.
  const user = await getMeAction();
  const admin = isAdmin(user.roles);
  const personnel = isAgent(user.roles) || admin;
  const token = await getToken();
  // Toutes les lectures partent ensemble ; une panne n'en retient aucune (l'API tranche de toute façon).
  const [capacites, crmTags, agence] = await Promise.all([
    personnel ? capacitesDuProfilActif().catch(() => null) : Promise.resolve(null),
    token ? fetchCrmTags(token).catch(() => []) : Promise.resolve([]),
    token && user.agency_id ? resolveAgencyOrNull(token, user.agency_id, 'crm/pipeline (nom)').catch(() => null) : Promise.resolve(null),
  ]);
  const lecteur = { personnel, admin, agence: personnel && (capacites ?? []).includes('crm.view_all') };

  return (
    <PageDuPipeline
      lecteur={lecteur}
      moi={nomAffichable(user)}
      agence={user.agency_id ? { id: user.agency_id, nom: agence?.name ?? null } : null}
      crmTags={crmTags}
    />
  );
}
