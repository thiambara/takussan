/**
 * TCK-602 (VERIF-602 M3) — l'URL qu'une mesure d'audience envoie à un tiers (Vercel Web Analytics)
 * ne porte aucun secret. Le script lit l'adresse de la page, pas un `Referer` : `Referrer-Policy`
 * n'y peut rien.
 *
 * - Un segment porteur devient son gabarit : `/pay/<jeton>` → `/pay/[token]` (lien de paiement,
 *   ADR-0051), `/share/<jeton>` → `/share/[token]` (lien de partage de document),
 *   `/auth/verify-email/<id>/<empreinte>` → `/auth/verify-email/[id]/[hash]`, préfixe de langue
 *   compris.
 * - Les paramètres de requête qui portent un secret ou une adresse (`token`, `email`,
 *   `signature`, `expires` : réinitialisation du mot de passe, lien signé) sont retirés.
 */
const SEGMENTS_PORTEURS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\/)(pay|share)\/[^/?#]+/g, '$1$2/[token]'],
  [/(^|\/)auth\/verify-email\/[^/?#]+\/[^/?#]+/g, '$1auth/verify-email/[id]/[hash]'],
];

const PARAMETRES_SECRETS = ['token', 'email', 'signature', 'expires'] as const;

export function urlSansSecret(url: string): string {
  const absolue = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  let lue: URL;
  try {
    lue = new URL(url, 'https://audience.invalid');
  } catch {
    return '/';
  }

  let chemin = lue.pathname;
  for (const [motif, gabarit] of SEGMENTS_PORTEURS) chemin = chemin.replace(motif, gabarit);
  for (const nom of PARAMETRES_SECRETS) lue.searchParams.delete(nom);
  const requete = lue.searchParams.toString();
  const reste = `${chemin}${requete ? `?${requete}` : ''}`;

  return absolue ? `${lue.origin}${reste}` : reste;
}

/** Le `beforeSend` de `<Analytics />` : même événement, URL expurgée. */
export function sansSecret<E extends { url: string }>(event: E): E {
  return { ...event, url: urlSansSecret(event.url) };
}
