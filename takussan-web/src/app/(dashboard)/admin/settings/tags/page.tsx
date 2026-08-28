import { redirect } from 'next/navigation';

import { AVIS_TAGS_GERES_PAR_PLATEFORME, urlAdminAvecAvis } from '@/lib/admin/notices';

export const dynamic = 'force-dynamic';

/**
 * SOUCHE DE REDIRECTION ASSUMÉE — `/admin/settings/tags` n'a, et n'aura, AUCUN chemin entrant.
 *
 * Les tags sont gérés par la plateforme, pas par l'agence : cette route ne montre rien et
 * renvoie sur `/admin`. Le motif voyage dans `?notice=` et il est LU à l'arrivée
 * (`AdminNotice`) — la valeur vient de la même constante des deux côtés (TCK-370).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ROUTE EXISTE ALORS QUE RIEN N'Y MÈNE (TCK-430)
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Parce qu'elle a été un VRAI écran, et qu'elle était LIÉE. Mesuré dans l'historique, pas
 * déduit :
 *
 *     $ git log --oneline -- 'src/app/(dashboard)/admin/settings/tags/'
 *     99dcb493 fix(web): console agence — quatre chemins et gestes morts (TCK-370)
 *     59caa65d TCK-213 super-admin tags management        ← devient une souche ici
 *     2805140a feat(TCK-066): admin tags & amenities UI   ← `TagsManager` complet ici
 *     $ git grep -n "settings/tags" 80e306e3 -- src | grep -v 'tags/page'
 *     .../admin/settings/integrations/page.tsx:42:  href="/admin/settings/tags"
 *     .../admin/settings/page.tsx:45:               href="/admin/settings/tags"
 *
 * Entre TCK-066 et TCK-213, l'écran montait `TagsManager` et DEUX bandeaux d'onglets y
 * menaient. TCK-213 a déplacé la gestion des tags vers `/super-admin/tags` et retiré les deux
 * liens. Des marque-pages de cette période existent donc pour de bon : la souche est le seul
 * endroit qui puisse encore leur répondre, et elle leur répond une phrase juste.
 *
 * ⚠ **Ne pas ajouter d'entrée « Tags » à `AdminSidebar`, ni d'onglet à `SettingsTabs`.** C'est
 * la correction réflexe et c'est celle qui aggrave : une entrée de menu dont la destination
 * redirige aussitôt fabrique un deuxième geste mort en réparant le premier. Un `agency_admin`
 * qui cherche les tags n'a rien à gagner à y arriver — il a à apprendre qu'ils ne sont pas chez
 * lui, ce qui est un contenu d'écran, pas une destination.
 *
 * ⚠ Portée réelle du bandeau, à ne pas surestimer : pour une agence `individual`, `/admin` est
 * dans `PRO_ROUTES` et `ensureStandardAgencyOrRedirect` renvoie sur `/app` — le motif part, la
 * page d'arrivée ne se rend jamais, et l'avis est perdu. Le fil `?notice=` n'aboutit donc que
 * pour une agence `standard`.
 */
export default async function Page() {
  redirect(urlAdminAvecAvis(AVIS_TAGS_GERES_PAR_PLATEFORME));
}
