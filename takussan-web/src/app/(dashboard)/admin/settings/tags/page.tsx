import { redirect } from 'next/navigation';

import { AVIS_TAGS_GERES_PAR_PLATEFORME, urlAdminAvecAvis } from '@/lib/admin/notices';

export const dynamic = 'force-dynamic';

/**
 * Les tags sont gérés par la plateforme, pas par l'agence : cette route ne montre rien et
 * renvoie sur `/admin`. Le motif voyage dans `?notice=` et il est LU à l'arrivée
 * (`AdminNotice`) — la valeur vient de la même constante des deux côtés (TCK-370).
 */
export default async function Page() {
  redirect(urlAdminAvecAvis(AVIS_TAGS_GERES_PAR_PLATEFORME));
}
