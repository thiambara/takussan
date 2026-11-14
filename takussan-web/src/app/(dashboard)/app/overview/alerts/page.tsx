import { redirect } from 'next/navigation';

import { cibleServeurDeLAncienneAdresse } from '@/lib/rapports/gardes-serveur';

/**
 * TCK-2628 (ADR-0096 § 4) — `/app/overview/alerts` est devenue un onglet de « Rapports » (`/app/reports`). L'adresse reste
 * servie pour les signets, les e-mails et les notifications, et ne rend qu'une redirection : vers l'onglet
 * équivalent, ou la vue d'ensemble quand cet onglet est masqué ou interdit, ou `/app`
 * pour une persona sans « Rapports » (`cibleDeLAncienneAdresse`).
 *
 * ⚠ Ni `layout.tsx` ni `loading.tsx` dans ce segment : une frontière de suspension rendrait la
 * redirection en 200 au lieu de 307 (TCK-426, `app/__tests__/etats-de-route.test.ts`).
 */
export default async function AnciennesAlertes(): Promise<never> {
  redirect(await cibleServeurDeLAncienneAdresse('/app/overview/alerts'));
}
