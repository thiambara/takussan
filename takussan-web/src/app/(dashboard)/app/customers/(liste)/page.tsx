import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { ListeDesClients } from '@/components/customer-dashboard/liste/ListeDesClients';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { filtresDeLaVue, lireLaListe, vuesDuLecteur, type VueDesClients } from '@/lib/crm/liste-des-clients';
import { fetchCrmTags, fetchCustomerCount, fetchDashboardCustomers } from '@/lib/queries/customers';
import { isAdmin, isAgent } from '@/lib/roles';
import { getToken } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customers');
  return { title: t('metaTitle') };
}

/**
 * TCK-042 — dashboard agent CRM, liste des clients.
 * TCK-093 — tags filter support.
 * TCK-2590 — vues « À relancer · Mes clients · Négociation · Tous » (et « Sans référent » pour
 * l'admin), tri par colonne, `per_page` réellement transmis, lignes de contact : la lecture de l'URL
 * est dans `lib/crm/liste-des-clients`, le rendu dans `ListeDesClients`.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.
  const params = await searchParams;
  const token = await getToken();
  // TCK-426 — NARROWING DE TYPE, PAS UNE DÉCISION. Le `layout.tsx` de ce segment a déjà refusé
  // l'absence de jeton, au-dessus de la frontière de suspension ; et `getMeAction()` redirige
  // vers `/auth/login` bien avant, depuis `(dashboard)/layout.tsx`. Cette branche est donc
  // inatteignable — mais `getToken()` rend `string | null` et le typage exige qu'on le dise.
  // *Ce qu'elle ne fait SURTOUT pas, c'est rediriger : sous un `loading.tsx`, un `redirect()` de
  // page rend 200 + le squelette au lieu du 307.*
  if (!token) return null;

  // TCK-591 §9 — créer un client et travailler le pipeline sont des gestes du PERSONNEL : l'API
  // refuse `POST /customers` à un bailleur (`CustomerPolicy::create`), l'écran ne le propose plus.
  // Ses fiches existantes restent lisibles. `getMeAction` est mémoïsé : le layout l'a déjà appelé.
  const { id: moi, roles } = await getMeAction();
  const admin = isAdmin(roles);
  const personnel = isAgent(roles) || admin;
  const lecteur = { personnel, admin };
  const etat = lireLaListe(params, lecteur);
  const vues = vuesDuLecteur(lecteur);

  // TCK-2590 — les comptes des vues : une lecture `per_page=1` par vue, en parallèle de la liste
  // (aucune route de comptes). Globaux : ni la recherche ni les filtres ne les changent. Les
  // capacités partent avec elles : « Me désigner » n'est offert qu'à qui porte `crm.assign`
  // (`SetPrimaryContactCustomerRequest`, 403 sinon) — jamais au bailleur, qu'on ne lit pas.
  // Toutes les lectures partent ENSEMBLE, aucune n'attend une autre (épinglé par le test).
  const [response, crmTags, capacites, ...comptes] = await Promise.all([
    fetchDashboardCustomers(token, { page: etat.page, perPage: etat.parPage, sort: etat.tri, filters: etat.filtres }),
    fetchCrmTags(token).catch(() => []),
    personnel ? capacitesDuProfilActif() : Promise.resolve([] as readonly string[]),
    ...vues.map((v) => fetchCustomerCount(token, filtresDeLaVue(v))),
  ]);
  // Une lecture des capacités en panne (`null`) n'offre rien : l'API trancherait de toute façon.
  const designer = personnel && (capacites ?? []).includes('crm.assign') ? { moi } : null;
  const comptesDesVues: Partial<Record<VueDesClients, number | null>> = Object.fromEntries(vues.map((v, i) => [v, comptes[i] ?? null]));

  const filtre = etat.vue !== 'tous' || Boolean(etat.filtres.search || etat.filtres.status || etat.filtres.pipeline_stage || etat.filtres.tags);

  return (
    <ListeDesClients
      page={response}
      vue={etat.vue}
      tri={etat.tri}
      vues={vues}
      comptes={comptesDesVues}
      personnel={personnel}
      admin={admin}
      designer={designer}
      crmTags={crmTags}
      filtre={filtre}
    />
  );
}
