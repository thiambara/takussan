/**
 * Fidélité (TCK-2798) — ce que l'outil décide sur les personas, sans base ni navigateur : quels jetons frapper,
 * et comment une URL reçoit le jeton d'une invitation sans que ce jeton n'atteigne un relevé.
 *
 * Le 2026-11-13, un `jetons --renouveler` a refrappé les jetons de TOUTES les personas : `jetons.php` révoque en
 * base les jetons `fidelite-pixel` de chaque compte qu'il frappe, et tous les agents qui relevaient en même temps
 * ont perdu leur session. Refrapper se fait désormais persona par persona, nommément.
 */

/**
 * Les personas dont `jetons` doit frapper le jeton (ou relire l'invitation).
 *
 * @param {{ demandes: string[] | null, renouveler: boolean, connues: string[], jetons: Record<string, { token?: string, invitation?: string }> }} o
 * @returns {string[]}
 */
export function personasAFrapper({ demandes, renouveler, connues, jetons }) {
  const inconnues = (demandes ?? []).filter((n) => !connues.includes(n));
  if (inconnues.length) throw new Error(`persona inconnue : ${inconnues.join(', ')} (${connues.join(', ')})`);
  if (renouveler) {
    if (!demandes?.length) {
      throw new Error('--renouveler exige --persona <nom>[,<nom>] : refrapper toutes les personas révoque les jetons des autres agents');
    }
    return demandes;
  }
  // Sans --renouveler, on ne frappe que ce qui manque au fichier : rien de présent n'est révoqué.
  return (demandes ?? connues).filter((n) => !jetons[n]?.token && !jetons[n]?.invitation);
}

export const MARQUE_INVITATION = '{invitation}';

/**
 * L'URL à ouvrir : `{invitation}` remplacé par le jeton de l'invitation. Le relevé garde le GABARIT (`source.url`) ;
 * seule la navigation porte le jeton. Le gabarit ne le porte que dans la requête : le chemin, comparé à celui de la
 * page rendue, reste celui du gabarit.
 *
 * @param {string} gabarit
 * @param {string | undefined} jeton
 */
export function remplirInvitation(gabarit, jeton) {
  if (!gabarit.includes(MARQUE_INVITATION)) return gabarit;
  const [chemin] = gabarit.split('?');
  if (chemin.includes(MARQUE_INVITATION)) throw new Error(`${MARQUE_INVITATION} n'a sa place que dans la requête de --url, jamais dans le chemin`);
  if (!jeton) throw new Error(`--url porte ${MARQUE_INVITATION} : --invitation <persona invitée> requis`);
  return gabarit.split(MARQUE_INVITATION).join(encodeURIComponent(jeton));
}

/**
 * Une URL observée sur le réseau, le jeton masqué : `meta.reseau` d'un relevé est versionné.
 *
 * @param {string} texte
 * @param {string[]} secrets
 */
export function masquer(texte, secrets) {
  let t = texte;
  for (const s of secrets) {
    if (!s) continue;
    t = t.split(s).join('<jeton>').split(encodeURIComponent(s)).join('<jeton>');
  }
  return t;
}
