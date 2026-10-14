import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * TCK-649 — l'identifiant du relevé se juge ICI, dans le layout du segment, et plus dans la page.
 *
 * Même règle que les huit layouts de détail de `/app` (TCK-442, `app/__tests__/etats-de-route.test.ts`) :
 * un `notFound()` de PAGE rend 200 dès qu'une frontière de suspension se pose au-dessus d'elle, un
 * `notFound()` de layout garde son 404. Le segment n'en porte aucune aujourd'hui — la garde
 * `garderPageAdmin` de la page l'interdit (`scripts/check-pro-routes.mjs`) —, mais la décision vit
 * à l'étage qui la rend fiable quoi qu'on pose plus tard.
 *
 * Seule la FORME de l'identifiant se juge ici : l'existence du relevé, elle, est lue par
 * `StatementDetail` côté client, sous la garde de l'API (`BankStatementPolicy`).
 *
 * ⚠ Ce layout ne rend rien de lui-même (`<>{children}</>`) : il reste transparent pour le
 * dictionnaire (`scripts/check-i18n-namespaces.mjs`), comme les layouts de refus de TCK-426.
 */
export default async function Layout({
  params,
  children,
}: {
  readonly params: Promise<{ statementId: string }>;
  readonly children: ReactNode;
}) {
  const id = Number((await params).statementId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <>{children}</>;
}
